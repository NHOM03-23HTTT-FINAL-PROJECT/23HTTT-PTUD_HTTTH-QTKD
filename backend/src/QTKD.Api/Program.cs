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
using Npgsql;
using Microsoft.AspNetCore.Http.Features;
using QTKD.Api.Authentication;
using QTKD.Api.BackgroundServices;
using QTKD.Application.Common.Interfaces;
using QTKD.Application.Features.Contracts;
using QTKD.Application.Features.Notifications;
using QTKD.Application.Features.Audit;
using QTKD.Domain.Contracts;
using QTKD.Api.Authorization;
using QTKD.Api.Endpoints;
using QTKD.Application.Features.ContractApprovals;
using QTKD.Application.Features.Workflows;
using QTKD.Infrastructure.ContractApprovals;
using QTKD.Application.Features.Identity;
using QTKD.Domain.Enums;
using QTKD.Domain.Identity;
using QTKD.Infrastructure;
using QTKD.Infrastructure.Identity;
using QTKD.Infrastructure.Persistence;
using QTKD.Infrastructure.Repositories;
using TokenOptions = QTKD.Infrastructure.Identity.TokenOptions;

var builder = WebApplication.CreateBuilder(args);
builder.WebHost.ConfigureKestrel(options => options.Limits.MaxRequestBodySize = 21 * 1024 * 1024);
builder.Configuration.AddJsonFile("appsettings.Local.json", optional: true).AddEnvironmentVariables();
builder.Logging.AddJsonConsole(options => options.IncludeScopes = true);
builder.Services.AddOptions<TokenOptions>().BindConfiguration("Jwt").ValidateDataAnnotations().ValidateOnStart();
builder.Services.AddOptions<DatabaseOptions>().BindConfiguration("ConnectionStrings").ValidateDataAnnotations().ValidateOnStart();
builder.Services.AddSingleton(TimeProvider.System);

// One translator for the whole app. The options lambda runs per request scope; a new translator each time
// makes EF build a new internal service provider per request and throw ManyServiceProvidersCreatedWarning
// after 20, which turned every later request into 500 SYSTEM_ERROR.
var enumNames = new NpgsqlNullNameTranslator();
builder.Services.AddDbContext<IdentityDbContext>((sp, options) =>
{
    var connectionString = sp.GetRequiredService<IConfiguration>().GetConnectionString("Identity") ?? throw new InvalidOperationException("ConnectionStrings:Identity is required.");
    options.UseNpgsql(connectionString, pg =>
    {
        pg.MapEnum<UserRole>("user_role", "qtkd", enumNames);
        pg.MapEnum<UserStatus>("user_status", "qtkd", enumNames);
        pg.MapEnum<SessionEndReason>("session_end_reason", "qtkd", enumNames);
        pg.MapEnum<ActiveStatus>("active_status", "qtkd", enumNames);
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
builder.Services.AddScoped<PasswordRecoveryService>();
builder.Services.AddOptions<PasswordRecoveryMailOptions>().BindConfiguration("PasswordRecovery:Smtp")
    .Validate(options => options.IsValid(), "Password recovery SMTP configuration is incomplete.").ValidateOnStart();
builder.Services.AddSingleton<IPasswordRecoveryMailSender, SmtpPasswordRecoveryMailSender>();
builder.Services.AddSingleton<PasswordRecoveryQueue>();
builder.Services.AddHostedService(sp => sp.GetRequiredService<PasswordRecoveryQueue>());
builder.Services.AddAuthOpenApi();
builder.Services.AddScoped<ContractApprovalService>();
builder.Services.AddSingleton<WorkflowEngine>();
builder.Services.AddScoped<PostgresApprovalStore>();
builder.Services.AddScoped<IApprovalDbSessions, ApprovalDbSessions>();
builder.Services.AddScoped<ContractCoordinationService>();
builder.Services.AddScoped<ApprovalAssignmentService>();
builder.Services.AddScoped<IApprovalStore>(sp => sp.GetRequiredService<PostgresApprovalStore>());
builder.Services.AddScoped<IContractApprovalEngine, ContractApprovalEngine>();
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
    options.OnRejected = (context, ct) => new ValueTask(context.HttpContext.Response.WriteAsJsonAsync(
        new { code = "RATE_LIMITED", traceId = context.HttpContext.TraceIdentifier }, ct));
    options.AddPolicy("auth", context => RateLimitPartition.GetFixedWindowLimiter(context.Connection.RemoteIpAddress?.ToString() ?? "unknown",
        _ => new FixedWindowRateLimiterOptions { PermitLimit = 30, Window = TimeSpan.FromMinutes(1), QueueLimit = 0 }));
    options.AddPolicy("password-recovery", context => RateLimitPartition.GetFixedWindowLimiter(context.Connection.RemoteIpAddress?.ToString() ?? "unknown",
        _ => new FixedWindowRateLimiterOptions { PermitLimit = 20, Window = TimeSpan.FromMinutes(1), QueueLimit = 0 }));
});
var allowedOrigins = builder.Configuration.GetSection("Cors:Origins").Get<string[]>() ?? [];
builder.Services.AddCors(options => options.AddDefaultPolicy(policy => policy.WithOrigins(allowedOrigins)
    .WithMethods("GET", "POST", "PUT", "PATCH", "DELETE").WithHeaders("Content-Type", "Authorization", "X-QTKD-CSRF", "Idempotency-Key").AllowCredentials()));

builder.Services.AddControllers().AddJsonOptions(options =>
{
    options.JsonSerializerOptions.Converters.Add(new System.Text.Json.Serialization.JsonStringEnumConverter());
});
builder.Services.Configure<FormOptions>(o => o.MultipartBodyLengthLimit = 21 * 1024 * 1024);
builder.Services.AddSingleton(sp => NpgsqlDataSource.Create(
    sp.GetRequiredService<IConfiguration>().GetConnectionString("Identity")!));
builder.Services.AddSingleton<PgDatabase>();
builder.Services.AddScoped<ICurrentActor, CurrentActor>();
builder.Services.AddScoped<IContractFileStorage>(_ => new ContractFileStorage(
    Path.GetFullPath(builder.Configuration["Storage:Root"] ?? Path.Combine(builder.Environment.ContentRootPath, ".data", "uploads"))));
builder.Services.AddScoped<ContractService>();
builder.Services.AddQtkdPersistence(
    sp => sp.GetRequiredService<IConfiguration>().GetConnectionString("Identity") ?? throw new InvalidOperationException("ConnectionStrings:Identity is required."),
    enumNames);
builder.Services.AddScoped<NotificationService>();
builder.Services.AddOptions<NotificationDeliveryOptions>().BindConfiguration("Notifications:Delivery")
    .Validate(o => o.BatchSize is >= 1 and <= 1000 && o.PollSeconds is >= 1 and <= 300,
        "Notification delivery batch size or polling interval is invalid.").ValidateOnStart();
builder.Services.AddHostedService<NotificationDeliveryWorker>();
builder.Services.AddScoped<AuditLogService>();
builder.Services.AddAreaInfrastructure(builder.Configuration);

var app = builder.Build();
app.Use(async (context, next) =>
{
    context.Response.Headers["X-Content-Type-Options"] = "nosniff";
    context.Response.Headers["Cache-Control"] = "no-store";
    context.Response.Headers["X-Correlation-ID"] = context.TraceIdentifier;
    try { await next(context); }
    catch (BusinessException error)
    {
        context.Response.StatusCode = error.Status;
        var body = System.Text.Json.JsonSerializer.SerializeToNode(error.Details ?? new { }, PgDatabase.Json)!.AsObject();
        body["code"] = error.Code;
        await context.Response.WriteAsJsonAsync(body);
    }
    catch (NpgsqlException error)
    {
        app.Logger.LogError(error, "DB_ERROR: Postgres driver error");
        context.Response.StatusCode = 500;
        await context.Response.WriteAsJsonAsync(new { code = "SYSTEM_ERROR", traceId = context.TraceIdentifier });
    }
    catch (ReviewFailure error)
    {
        context.Response.StatusCode = error.Status;
        await context.Response.WriteAsJsonAsync(new { code = error.Code, traceId = context.TraceIdentifier });
    }
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
    if (context.User.Identity?.IsAuthenticated == true && !temporaryPaths.Contains(context.Request.Path) && context.User.FindFirstValue("must_change_password") == "true")
    {
        context.Response.StatusCode = 403;
        await context.Response.WriteAsJsonAsync(new { code = "PASSWORD_CHANGE_REQUIRED", traceId = context.TraceIdentifier });
        return;
    }
    await next(context);
});
app.UseAuthorization();
app.MapContractApprovals(allowedOrigins);

const string cookieName = "__Host-qtkd-refresh";
bool IsClientHttps(HttpContext context)
{
    var proto = context.Request.Headers["X-Forwarded-Proto"].ToString();
    if (!string.IsNullOrEmpty(proto))
        return proto.Equals("https", StringComparison.OrdinalIgnoreCase);
    var origin = context.Request.Headers.Origin.ToString();
    if (!string.IsNullOrEmpty(origin))
        return origin.StartsWith("https:", StringComparison.OrdinalIgnoreCase);
    var referer = context.Request.Headers.Referer.ToString();
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
    var name = isHttps ? "__Host-qtkd-refresh" : "qtkd-refresh";
    context.Response.Cookies.Append(name, result.RefreshToken,
        new CookieOptions { HttpOnly = true, Secure = isHttps, SameSite = isHttps ? SameSiteMode.Strict : SameSiteMode.Lax, Path = "/", Expires = result.Remember ? new DateTimeOffset(DateTime.SpecifyKind(result.ExpiresAt, DateTimeKind.Utc)) : null });
}

(Guid User, Guid Session) Subject(HttpContext context) => (Guid.Parse(context.User.FindFirstValue("sub")!), Guid.Parse(context.User.FindFirstValue("sid")!));

app.MapGet("/health/live", () => Results.Ok(new { status = "up" })).AllowAnonymous();
var auth = app.MapGroup("/api/v1/auth").WithTags("Authentication");
auth.MapPost("/login", async (LoginRequest request, IIdentityService identity, HttpContext context, CancellationToken ct) =>
{
    RequireCsrf(context);
    var result = await identity.Login(request, context.Connection.RemoteIpAddress?.ToString(), context.Request.Headers.UserAgent.ToString(), ct);
    // One current refresh cookie per browser. Another device uses a separate cookie jar.
    var currentCookie = GetRefreshCookie(context) ?? context.Request.Cookies[cookieName];
    if (!string.IsNullOrEmpty(currentCookie)) await identity.Logout(currentCookie, null, false, ct);
    SetRefresh(context, result); return TypedResults.Ok(AuthResponse.From(result));
}).AllowAnonymous().RequireRateLimiting("auth")
    .WithDescription("Returns an access JWT and sets the refresh cookie. Errors: VALIDATION, INVALID_CREDENTIALS, DISABLED, LOCKED, CSRF_REJECTED, RATE_LIMITED.")
    .AuthErrors(400, 401, 403, 423, 429);
auth.MapPost("/refresh", async (IIdentityService identity, HttpContext context, CancellationToken ct) =>
{
    RequireCsrf(context); var result = await identity.Refresh(GetRefreshCookie(context) ?? context.Request.Cookies[cookieName] ?? "", ct);
    SetRefresh(context, result); return TypedResults.Ok(AuthResponse.From(result));
}).AllowAnonymous().RequireRateLimiting("auth")
    .WithDescription("Rotates the HttpOnly refresh cookie. Requires the current cookie. A rejected session returns 401.")
    .AuthErrors(401, 403, 429);
auth.MapPost("/logout", async (IIdentityService identity, HttpContext context, CancellationToken ct) =>
{
    RequireCsrf(context); await identity.Logout(GetRefreshCookie(context) ?? context.Request.Cookies[cookieName], context.Connection.RemoteIpAddress?.ToString(), true, ct);
    context.Response.Cookies.Delete(cookieName, new CookieOptions { Secure = true, HttpOnly = true, SameSite = SameSiteMode.Strict, Path = "/" });
    context.Response.Cookies.Delete("qtkd-refresh", new CookieOptions { Secure = false, HttpOnly = true, SameSite = SameSiteMode.Lax, Path = "/" });
    return TypedResults.NoContent();
}).AllowAnonymous().RequireRateLimiting("auth")
    .WithDescription("Revokes the session identified by the refresh cookie and clears the cookie.").AuthErrors(403, 429);
auth.MapGet("/session", async (IIdentityService identity, HttpContext context, CancellationToken ct) =>
{
    var subject = Subject(context); return TypedResults.Ok(await identity.Session(subject.User, subject.Session, false, ct));
}).RequireAuthorization().WithDescription("Reads the current user and session without extending idle time.").AuthErrors(401);
auth.MapPost("/activity", async (IIdentityService identity, HttpContext context, CancellationToken ct) =>
{
    var subject = Subject(context); return TypedResults.Ok(await identity.Session(subject.User, subject.Session, true, ct));
}).RequireAuthorization().WithDescription("Records user activity and returns the updated session.").AuthErrors(401);
auth.MapPost("/password/change", async (PasswordRequest request, IIdentityService identity, HttpContext context, CancellationToken ct) =>
{
    RequireCsrf(context); var subject = Subject(context);
    var currentCookie = GetRefreshCookie(context) ?? context.Request.Cookies[cookieName];
    var result = await identity.ChangePassword(subject.User, subject.Session, request, currentCookie, context.Connection.RemoteIpAddress?.ToString(), ct);
    SetRefresh(context, result); return TypedResults.Ok(AuthResponse.From(result));
}).RequireAuthorization().RequireRateLimiting("auth")
    .WithDescription("Requires the current password, Bearer JWT and refresh cookie. Errors include WRONG_CURRENT, LOCKED, WEAK_PASSWORD and SAME_AS_CURRENT.")
    .AuthErrors(400, 401, 403, 429);

var recovery = auth.MapGroup("/password/recovery").AllowAnonymous().RequireRateLimiting("password-recovery");
recovery.MapPost("/send", (SendOtpRequest request, PasswordRecoveryQueue queue, HttpContext context) =>
{
    RequireCsrf(context);
    return TypedResults.Accepted((string?)null, queue.Request(request));
}).WithDescription("Accepts a request to email an OTP. The response is independent of whether the account exists. EMAIL_FAILED indicates unavailable delivery queue or configuration.")
    .AuthErrors(400, 403, 429, 503);
recovery.MapPost("/verify", async (VerifyOtpRequest request, PasswordRecoveryService service, HttpContext context, CancellationToken ct) =>
{
    RequireCsrf(context);
    var started = TimeProvider.System.GetTimestamp();
    try
    {
        return TypedResults.Ok(await service.Verify(request, ct));
    }
    catch (IdentityFailure error) when (error.Code == "INVALID_CODE")
    {
        // Failed lookups and failed attempts should have a comparable response time.
        var remaining = TimeSpan.FromMilliseconds(300) - TimeProvider.System.GetElapsedTime(started);
        if (remaining > TimeSpan.Zero) await Task.Delay(remaining, ct);
        throw;
    }
}).WithDescription("Exchanges a single-use OTP for a reset token. INVALID_CODE covers incorrect, expired, used or blocked codes.")
    .AuthErrors(400, 403, 429);
recovery.MapPost("/reset", async (ResetPasswordRequest request, PasswordRecoveryService service, HttpContext context, CancellationToken ct) =>
{
    RequireCsrf(context);
    return TypedResults.Ok(await service.Reset(request, context.Connection.RemoteIpAddress?.ToString(), ct));
}).WithDescription("Consumes a reset token and revokes all account sessions. Errors include TOKEN_EXPIRED, WEAK_PASSWORD and SAME_AS_CURRENT.")
    .AuthErrors(400, 403, 429);

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
app.MapGet("/api/health", () => Results.Ok(new { status = "ok", database = "not-checked" })).AllowAnonymous();
app.Run();

public partial class Program;
