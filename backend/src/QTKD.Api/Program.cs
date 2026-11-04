using System.Security.Claims;
using System.Text;
using System.Threading.RateLimiting;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using Npgsql.NameTranslation;
using QTKD.Api.Authorization;
using QTKD.Application.Features.Identity;
using QTKD.Domain.Enums;
using QTKD.Domain.Identity;
using QTKD.Infrastructure;
using QTKD.Infrastructure.Identity;
using QTKD.Infrastructure.Persistence;
using TokenOptions = QTKD.Infrastructure.Identity.TokenOptions;

var builder = WebApplication.CreateBuilder(args);
builder.WebHost.ConfigureKestrel(options => options.Limits.MaxRequestBodySize = 16 * 1024);
builder.Configuration.AddJsonFile("appsettings.Local.json", optional: true).AddEnvironmentVariables();
builder.Logging.AddJsonConsole(options => options.IncludeScopes = true);
builder.Services.AddOptions<TokenOptions>().BindConfiguration("Jwt").ValidateDataAnnotations().ValidateOnStart();
builder.Services.AddOptions<DatabaseOptions>().BindConfiguration("ConnectionStrings").ValidateDataAnnotations().ValidateOnStart();
builder.Services.AddSingleton(TimeProvider.System);
var nullTranslator = new NpgsqlNullNameTranslator();
builder.Services.AddDbContext<IdentityDbContext>((sp, options) =>
{
    var connectionString = sp.GetRequiredService<IConfiguration>().GetConnectionString("Identity") ?? throw new InvalidOperationException("ConnectionStrings:Identity is required.");
    options.UseNpgsql(connectionString, pg =>
    {
        pg.MapEnum<UserRole>("user_role", "qtkd", nullTranslator);
        pg.MapEnum<UserStatus>("user_status", "qtkd", nullTranslator);
        pg.MapEnum<SessionEndReason>("session_end_reason", "qtkd", nullTranslator);
        pg.MapEnum<ActiveStatus>("active_status", "qtkd", nullTranslator);
    });
    options.ConfigureWarnings(w => w.Ignore(Microsoft.EntityFrameworkCore.Diagnostics.CoreEventId.ManyServiceProvidersCreatedWarning));
});
builder.Services.AddIdentityCore<UserAccount>(options =>
{
    options.User.RequireUniqueEmail = true;
    options.Password.RequiredLength = 12;
    options.Password.RequireUppercase = options.Password.RequireLowercase = options.Password.RequireDigit = options.Password.RequireNonAlphanumeric = true;
}).AddUserStore<UserAccountStore>();
builder.Services.AddScoped<IPasswordHasher<UserAccount>, BcryptPasswordHasher>();
builder.Services.AddScoped<TokenIssuer>();
builder.Services.AddScoped<IIdentityService, IdentityService>();
builder.Services.AddHttpContextAccessor();
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme).AddJwtBearer();
builder.Services.AddSingleton<Microsoft.Extensions.Options.IOptionsChangeTokenSource<JwtBearerOptions>>(
    new Microsoft.Extensions.Options.ConfigurationChangeTokenSource<JwtBearerOptions>(JwtBearerDefaults.AuthenticationScheme, builder.Configuration.GetSection("Jwt")));
builder.Services.AddOptions<JwtBearerOptions>(JwtBearerDefaults.AuthenticationScheme).Configure<IConfiguration>((options, configuration) =>
{
    options.MapInboundClaims = false;
    options.TokenValidationParameters = new TokenValidationParameters
    {
        ValidateIssuer = true, ValidIssuer = configuration["Jwt:Issuer"] ?? "qtkd-api",
        ValidateAudience = true, ValidAudience = configuration["Jwt:Audience"] ?? "qtkd-web",
        ValidateLifetime = true, RequireExpirationTime = true, RequireSignedTokens = true,
        ValidateIssuerSigningKey = true, IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(configuration["Jwt:SigningKey"] ?? "")),
        ValidAlgorithms = [SecurityAlgorithms.HmacSha256], ClockSkew = TimeSpan.FromSeconds(60), NameClaimType = "sub"
    };
    options.Events = new JwtBearerEvents
    {
        OnTokenValidated = async context =>
        {
            if (!Guid.TryParse(context.Principal?.FindFirstValue("sub"), out var userId)
                || !Guid.TryParse(context.Principal?.FindFirstValue("sid"), out var sessionId)) { context.Fail("Invalid token subject/session"); return; }
            try
            {
                var session = await context.HttpContext.RequestServices.GetRequiredService<IIdentityService>().Session(userId, sessionId, false, context.HttpContext.RequestAborted);
                var claims = (ClaimsIdentity)context.Principal!.Identity!;
                foreach (var claim in claims.FindAll("must_change_password").ToArray()) claims.RemoveClaim(claim);
                claims.AddClaim(new("must_change_password", session.User.MustChangePassword ? "true" : "false"));
            }
            catch (IdentityFailure error) when (error.Status == 401) { context.HttpContext.Items["auth-error"] = error.Code; context.Fail("Session ended"); }
        },
        OnChallenge = async context =>
        {
            context.HandleResponse(); context.Response.StatusCode = 401; context.Response.Headers.WWWAuthenticate = "Bearer";
            await context.Response.WriteAsJsonAsync(new { code = context.HttpContext.Items["auth-error"] as string ?? "SESSION_ENDED", traceId = context.HttpContext.TraceIdentifier });
        },
        OnForbidden = context =>
        {
            context.Response.StatusCode = 403;
            return context.Response.WriteAsJsonAsync(new { code = context.HttpContext.User.FindFirstValue("must_change_password") == "true" ? "PASSWORD_CHANGE_REQUIRED" : "FORBIDDEN", traceId = context.HttpContext.TraceIdentifier });
        }
    };
});
builder.Services.AddScoped<IAuthorizationHandler, IdentityPolicyHandler>();
builder.Services.AddScoped<IAuthorizationHandler, BusinessReadyHandler>();
builder.Services.AddScoped<IAuthorizationHandler, ResourceAccessHandler>();
builder.Services.AddAuthorization(options =>
{
    options.FallbackPolicy = new AuthorizationPolicyBuilder().RequireAuthenticatedUser().AddRequirements(new BusinessReady()).Build();
    foreach (var code in PermissionCatalog.Codes) options.AddPolicy(code, policy => policy.RequireAuthenticatedUser().AddRequirements(new BusinessReady(), new PermissionRequirement(code)));
    options.AddPolicy("ResourceAccess", policy => policy.RequireAuthenticatedUser().AddRequirements(new BusinessReady(), new ResourceRequirement()));
});
builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = 429;
    options.AddPolicy("auth", context => RateLimitPartition.GetFixedWindowLimiter(context.Connection.RemoteIpAddress?.ToString() ?? "unknown",
        _ => new FixedWindowRateLimiterOptions { PermitLimit = 30, Window = TimeSpan.FromMinutes(1), QueueLimit = 0 }));
});
var allowedOrigins = builder.Configuration.GetSection("Cors:Origins").Get<string[]>() ?? [];
builder.Services.AddCors(options => options.AddDefaultPolicy(policy => policy.WithOrigins(allowedOrigins)
    .WithMethods("GET", "POST", "PUT", "PATCH", "DELETE").WithHeaders("Content-Type", "Authorization", "X-QTKD-CSRF").AllowCredentials()));

builder.Services.AddControllers().AddJsonOptions(options =>
{
    options.JsonSerializerOptions.Converters.Add(new System.Text.Json.Serialization.JsonStringEnumConverter());
});
builder.Services.AddAreaInfrastructure(builder.Configuration);

var app = builder.Build();
app.Use(async (context, next) =>
{
    context.Response.Headers["X-Content-Type-Options"] = "nosniff";
    context.Response.Headers["Cache-Control"] = "no-store";
    context.Response.Headers["X-Correlation-ID"] = context.TraceIdentifier;
    try { await next(context); }
    catch (IdentityFailure error)
    {
        context.Response.StatusCode = error.Status;
        await context.Response.WriteAsJsonAsync(new { code = error.Code, remainingAttempts = error.RemainingAttempts, lockedUntil = error.LockedUntil, traceId = context.TraceIdentifier });
    }
    catch (ArgumentException error)
    {
        context.Response.StatusCode = 400;
        await context.Response.WriteAsJsonAsync(new { code = "VALIDATION", message = error.Message, traceId = context.TraceIdentifier });
    }
    catch (InvalidOperationException error)
    {
        context.Response.StatusCode = 400;
        await context.Response.WriteAsJsonAsync(new { code = "BUSINESS_RULE_VIOLATION", message = error.Message, traceId = context.TraceIdentifier });
    }
    catch (KeyNotFoundException error)
    {
        context.Response.StatusCode = 404;
        await context.Response.WriteAsJsonAsync(new { code = "NOT_FOUND", message = error.Message, traceId = context.TraceIdentifier });
    }
    catch (DbUpdateConcurrencyException)
    {
        context.Response.StatusCode = 409;
        await context.Response.WriteAsJsonAsync(new { code = "CONCURRENCY_CONFLICT", message = "Dữ liệu đã bị thay đổi bởi người khác. Vui lòng tải lại trang.", traceId = context.TraceIdentifier });
    }
    catch (Exception error)
    {
        // Never log raw provider exceptions: they may contain connection details or SQL values.
        app.Logger.LogError(error, "REQUEST_FAILED {ExceptionType}: {ErrorMessage} {TraceId}", error.GetType().Name, error.Message, context.TraceIdentifier);
        context.Response.StatusCode = 500;
        await context.Response.WriteAsJsonAsync(new { code = "SYSTEM_ERROR", message = error.Message, traceId = context.TraceIdentifier });
    }
});
app.UseCors();
app.UseAuthentication();
var temporaryPaths = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
{ "/api/v1/auth/login", "/api/v1/auth/session", "/api/v1/auth/activity", "/api/v1/auth/refresh", "/api/v1/auth/logout", "/api/v1/auth/password/change" };
app.Use(async (context, next) =>
{
    using var scope = app.Logger.BeginScope(new Dictionary<string, object?> { ["TraceId"] = context.TraceIdentifier, ["ActorId"] = context.User.FindFirstValue("sub") });
    if (context.User.FindFirstValue("must_change_password") == "true" && context.Request.Path.StartsWithSegments("/api/v1")
        && !temporaryPaths.Contains(context.Request.Path.Value?.TrimEnd('/') ?? ""))
    {
        context.Response.StatusCode = 403;
        await context.Response.WriteAsJsonAsync(new { code = "PASSWORD_CHANGE_REQUIRED", traceId = context.TraceIdentifier });
        return;
    }
    await next(context);
});
app.UseRateLimiter();
app.UseAuthorization();

bool IsClientHttps(HttpContext context)
{
    var origin = context.Request.Headers.Origin.ToString();
    var referer = context.Request.Headers.Referer.ToString();
    if (!string.IsNullOrEmpty(origin))
        return origin.StartsWith("https:", StringComparison.OrdinalIgnoreCase);
    if (!string.IsNullOrEmpty(referer))
        return referer.StartsWith("https:", StringComparison.OrdinalIgnoreCase);
    return context.Request.IsHttps;
}
string CookieName(HttpContext context) => IsClientHttps(context) ? "__Host-qtkd-refresh" : "qtkd-refresh";
string? GetRefreshCookie(HttpContext context) => context.Request.Cookies["qtkd-refresh"] ?? context.Request.Cookies["__Host-qtkd-refresh"];
bool Csrf(HttpContext context)
{
    if (context.Request.Headers["X-QTKD-CSRF"] != "1") return false;
    var origin = context.Request.Headers.Origin.ToString();
    if (string.IsNullOrEmpty(origin) && Uri.TryCreate(context.Request.Headers.Referer.ToString(), UriKind.Absolute, out var refUri))
    {
        origin = $"{refUri.Scheme}://{refUri.Authority}";
    }
    if (string.IsNullOrEmpty(origin)) return true;
    return allowedOrigins.Contains(origin, StringComparer.OrdinalIgnoreCase);
}
void RequireCsrf(HttpContext context) { if (!Csrf(context)) throw new IdentityFailure(403, "CSRF_REJECTED"); }
void SetRefresh(HttpContext context, AuthResult result)
{
    var isHttps = IsClientHttps(context);
    context.Response.Cookies.Append(CookieName(context), result.RefreshToken,
        new CookieOptions
        {
            HttpOnly = true,
            Secure = isHttps,
            SameSite = isHttps ? SameSiteMode.Strict : SameSiteMode.Lax,
            Path = "/",
            Expires = result.Remember ? new DateTimeOffset(DateTime.SpecifyKind(result.ExpiresAt, DateTimeKind.Utc)) : null
        });
}
void DeleteRefresh(HttpContext context)
{
    var isHttps = IsClientHttps(context);
    context.Response.Cookies.Delete(CookieName(context), new CookieOptions { HttpOnly = true, Secure = isHttps, SameSite = isHttps ? SameSiteMode.Strict : SameSiteMode.Lax, Path = "/" });
    context.Response.Cookies.Delete("__Host-qtkd-refresh", new CookieOptions { HttpOnly = true, Secure = true, SameSite = SameSiteMode.Strict, Path = "/" });
    context.Response.Cookies.Delete("qtkd-refresh", new CookieOptions { HttpOnly = true, Secure = false, SameSite = SameSiteMode.Lax, Path = "/" });
}
object PublicResult(AuthResult result) => new
{
    result.AccessToken,
    accessTokenExpiresAt = DateTime.SpecifyKind(result.AccessTokenExpiresAt, DateTimeKind.Utc).ToString("O"),
    result.User,
    signedInAt = DateTime.SpecifyKind(result.SignedInAt, DateTimeKind.Utc).ToString("O"),
    idleExpiresAt = DateTime.SpecifyKind(result.IdleExpiresAt, DateTimeKind.Utc).ToString("O"),
    expiresAt = DateTime.SpecifyKind(result.ExpiresAt, DateTimeKind.Utc).ToString("O"),
    result.PreviousLogin,
    passwordChangedAt = result.User.PasswordChangedAt.HasValue
        ? DateTime.SpecifyKind(result.User.PasswordChangedAt.Value, DateTimeKind.Utc).ToString("O")
        : null
};
(Guid User, Guid Session) Subject(HttpContext context) => (Guid.Parse(context.User.FindFirstValue("sub")!), Guid.Parse(context.User.FindFirstValue("sid")!));

app.MapGet("/health/live", () => Results.Ok(new { status = "up" })).AllowAnonymous();
var auth = app.MapGroup("/api/v1/auth");
auth.MapPost("/login", async (LoginRequest request, IIdentityService identity, HttpContext context, CancellationToken ct) =>
{
    RequireCsrf(context);
    var result = await identity.Login(request, context.Connection.RemoteIpAddress?.ToString(), context.Request.Headers.UserAgent.ToString(), ct);
    SetRefresh(context, result);
    return Results.Ok(PublicResult(result));
}).AllowAnonymous().RequireRateLimiting("auth");
auth.MapPost("/refresh", async (IIdentityService identity, HttpContext context, CancellationToken ct) =>
{
    RequireCsrf(context); var result = await identity.Refresh(GetRefreshCookie(context) ?? "", ct);
    SetRefresh(context, result); return Results.Ok(PublicResult(result));
}).AllowAnonymous().RequireRateLimiting("auth");
auth.MapPost("/logout", async (IIdentityService identity, HttpContext context, CancellationToken ct) =>
{
    RequireCsrf(context); await identity.Logout(GetRefreshCookie(context), ct);
    DeleteRefresh(context);
    return Results.NoContent();
}).AllowAnonymous().RequireRateLimiting("auth");
auth.MapGet("/session", async (IIdentityService identity, HttpContext context, CancellationToken ct) =>
{
    var subject = Subject(context);
    var s = await identity.Session(subject.User, subject.Session, false, ct);
    return Results.Ok(new
    {
        status = s.Status,
        user = s.User,
        signedInAt = DateTime.SpecifyKind(s.SignedInAt, DateTimeKind.Utc).ToString("O"),
        idleExpiresAt = DateTime.SpecifyKind(s.IdleExpiresAt, DateTimeKind.Utc).ToString("O"),
        expiresAt = DateTime.SpecifyKind(s.ExpiresAt, DateTimeKind.Utc).ToString("O")
    });
}).RequireAuthorization();
auth.MapPost("/activity", async (IIdentityService identity, HttpContext context, CancellationToken ct) =>
{
    var subject = Subject(context);
    var s = await identity.Session(subject.User, subject.Session, true, ct);
    return Results.Ok(new
    {
        status = s.Status,
        user = s.User,
        signedInAt = DateTime.SpecifyKind(s.SignedInAt, DateTimeKind.Utc).ToString("O"),
        idleExpiresAt = DateTime.SpecifyKind(s.IdleExpiresAt, DateTimeKind.Utc).ToString("O"),
        expiresAt = DateTime.SpecifyKind(s.ExpiresAt, DateTimeKind.Utc).ToString("O")
    });
}).RequireAuthorization();
auth.MapPost("/password/change", async (PasswordRequest request, IIdentityService identity, HttpContext context, CancellationToken ct) =>
{
    RequireCsrf(context); var subject = Subject(context);
    var result = await identity.ChangePassword(subject.User, subject.Session, request, GetRefreshCookie(context), ct);
    SetRefresh(context, result); return Results.Ok(PublicResult(result));
}).RequireAuthorization().RequireRateLimiting("auth");
app.MapGet("/api/v1/users", async (IIdentityService identity, CancellationToken ct) => Results.Ok(await identity.Users(ct))).RequireAuthorization("users.manage");
app.MapGet("/api/v1/users/{id:guid}", async (Guid id, IIdentityService identity, CancellationToken ct) => Results.Ok(await identity.User(id, ct))).RequireAuthorization("users.manage");
app.MapPost("/api/v1/users", async (CreateUserRequest request, IIdentityService identity, CancellationToken ct) =>
{
    var user = await identity.CreateUser(request, ct); return Results.Created($"/api/v1/users/{user.Id}", user);
}).RequireAuthorization("users.manage");
app.MapPut("/api/v1/users/{id:guid}", async (Guid id, UpdateUserRequest request, IIdentityService identity, HttpContext context, CancellationToken ct) =>
    Results.Ok(await identity.UpdateUser(Subject(context).User, id, request, ct))).RequireAuthorization("users.manage");
app.MapGet("/api/v1/departments", async (IIdentityService identity, CancellationToken ct) => Results.Ok(await identity.Departments(ct))).RequireAuthorization("users.manage");
app.MapPost("/api/v1/departments", async (DepartmentRequest request, IIdentityService identity, CancellationToken ct) =>
    Results.Ok(await identity.SaveDepartment(null, request, ct))).RequireAuthorization("departments.manage");
app.MapPut("/api/v1/departments/{id:guid}", async (Guid id, DepartmentRequest request, IIdentityService identity, CancellationToken ct) =>
    Results.Ok(await identity.SaveDepartment(id, request, ct))).RequireAuthorization("departments.manage");
app.MapGet("/api/v1/roles", async (IIdentityService identity, CancellationToken ct) => Results.Ok(await identity.Roles(ct))).RequireAuthorization("roles.manage");
app.MapPut("/api/v1/roles/{code}/permissions", async (string code, GrantsRequest request, IIdentityService identity, CancellationToken ct) =>
{
    await identity.SaveGrants(code, request.Permissions, ct); return Results.NoContent();
}).RequireAuthorization("roles.manage");
app.MapGet("/api/v1/permissions", async (IIdentityService identity, CancellationToken ct) => Results.Ok(await identity.Permissions(ct))).RequireAuthorization("roles.manage");
app.MapControllers();
app.Run();

public partial class Program;
