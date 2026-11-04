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
using QTKD.Application.Common.Interfaces;
using QTKD.Application.Features.Contracts;
using QTKD.Application.Features.Notifications;
using QTKD.Domain.Contracts;
using QTKD.Api.Authorization;
using QTKD.Api.Endpoints;
using QTKD.Application.Features.ContractApprovals;
using QTKD.Application.Features.Workflows;
using QTKD.Infrastructure.ContractApprovals;
using QTKD.Application.Features.Identity;
using QTKD.Domain.Identity;
using QTKD.Infrastructure.Identity;
using QTKD.Infrastructure.Persistence;
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
builder.Services.AddDbContext<IdentityDbContext>((sp, options) => options.UseNpgsql(
    sp.GetRequiredService<IConfiguration>().GetConnectionString("Identity") ?? throw new InvalidOperationException("ConnectionStrings:Identity is required."),
    pg => { pg.MapEnum<UserRole>("user_role", "qtkd", enumNames);
        pg.MapEnum<UserStatus>("user_status", "qtkd", enumNames); pg.MapEnum<SessionEndReason>("session_end_reason", "qtkd", enumNames); }));
builder.Services.AddIdentityCore<UserAccount>(options =>
{
    options.User.RequireUniqueEmail = true;
    options.Password.RequiredLength = 12;
    options.Password.RequireUppercase = options.Password.RequireLowercase = options.Password.RequireDigit = options.Password.RequireNonAlphanumeric = true;
}).AddUserStore<UserAccountStore>();
builder.Services.AddScoped<IPasswordHasher<UserAccount>, BcryptPasswordHasher>();
builder.Services.AddScoped<TokenIssuer>();
builder.Services.AddScoped<IIdentityService, IdentityService>();
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
    options.AddPolicy("auth", context => RateLimitPartition.GetFixedWindowLimiter(context.Connection.RemoteIpAddress?.ToString() ?? "unknown",
        _ => new FixedWindowRateLimiterOptions { PermitLimit = 30, Window = TimeSpan.FromMinutes(1), QueueLimit = 0 }));
});
var allowedOrigins = builder.Configuration.GetSection("Cors:Origins").Get<string[]>() ?? [];
builder.Services.AddCors(options => options.AddDefaultPolicy(policy => policy.WithOrigins(allowedOrigins)
    .WithMethods("GET", "POST", "PUT").WithHeaders("Content-Type", "Authorization", "X-QTKD-CSRF", "Idempotency-Key").AllowCredentials()));

builder.Services.AddControllers();
builder.Services.Configure<FormOptions>(o => o.MultipartBodyLengthLimit = 21 * 1024 * 1024);
builder.Services.AddSingleton(sp => NpgsqlDataSource.Create(
    sp.GetRequiredService<IConfiguration>().GetConnectionString("Identity")!));
builder.Services.AddSingleton<PgDatabase>();
builder.Services.AddScoped<ICurrentActor, CurrentActor>();
builder.Services.AddScoped<IContractStore>(sp => new PostgresContractStore(
    sp.GetRequiredService<PgDatabase>(),
    Path.GetFullPath(builder.Configuration["Storage:Root"] ?? Path.Combine(builder.Environment.ContentRootPath, ".data", "uploads"))));
builder.Services.AddScoped<ContractService>();
builder.Services.AddScoped<INotificationStore, PostgresNotificationStore>();
builder.Services.AddScoped<NotificationService>();

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
        var conflict = (error as PostgresException)?.SqlState is "23505" or "40001" or "40P01" or "23514";
        context.Response.StatusCode = conflict ? 409 : 503;
        await context.Response.WriteAsJsonAsync(new { code = conflict ? "CONFLICT" : "DATABASE_UNAVAILABLE" });
    }
    catch (BadHttpRequestException)
    {
        context.Response.StatusCode = 400;
        await context.Response.WriteAsJsonAsync(new { code = "VALIDATION", traceId = context.TraceIdentifier });
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
    catch (Exception error)
    {
        // Never log raw provider exceptions: they may contain connection details or SQL values.
        app.Logger.LogError("REQUEST_FAILED {ExceptionType} {TraceId}", error.GetType().Name, context.TraceIdentifier);
        context.Response.StatusCode = 500;
        await context.Response.WriteAsJsonAsync(new { code = "SYSTEM_ERROR", traceId = context.TraceIdentifier });
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
app.MapContractApprovals(allowedOrigins);

const string cookieName = "__Host-qtkd-refresh";
bool Csrf(HttpContext context) => context.Request.Headers["X-QTKD-CSRF"] == "1"
    && allowedOrigins.Contains(context.Request.Headers.Origin.ToString(), StringComparer.Ordinal);
void RequireCsrf(HttpContext context) { if (!Csrf(context)) throw new IdentityFailure(403, "CSRF_REJECTED"); }
void SetRefresh(HttpContext context, AuthResult result) => context.Response.Cookies.Append(cookieName, result.RefreshToken,
    new CookieOptions { HttpOnly = true, Secure = true, SameSite = SameSiteMode.Strict, Path = "/", Expires = result.Remember ? new DateTimeOffset(DateTime.SpecifyKind(result.ExpiresAt, DateTimeKind.Utc)) : null });
object PublicResult(AuthResult result) => new { result.AccessToken, result.AccessTokenExpiresAt, result.User, result.SignedInAt,
    result.IdleExpiresAt, result.ExpiresAt, result.PreviousLogin, passwordChangedAt = result.User.PasswordChangedAt };
(Guid User, Guid Session) Subject(HttpContext context) => (Guid.Parse(context.User.FindFirstValue("sub")!), Guid.Parse(context.User.FindFirstValue("sid")!));

app.MapGet("/health/live", () => Results.Ok(new { status = "up" })).AllowAnonymous();
var auth = app.MapGroup("/api/v1/auth");
auth.MapPost("/login", async (LoginRequest request, IIdentityService identity, HttpContext context, CancellationToken ct) =>
{
    RequireCsrf(context);
    var result = await identity.Login(request, context.Connection.RemoteIpAddress?.ToString(), context.Request.Headers.UserAgent.ToString(), ct);
    // One current refresh cookie per browser. Another device uses a separate cookie jar.
    await identity.Logout(context.Request.Cookies[cookieName], ct);
    SetRefresh(context, result); return Results.Ok(PublicResult(result));
}).AllowAnonymous().RequireRateLimiting("auth");
auth.MapPost("/refresh", async (IIdentityService identity, HttpContext context, CancellationToken ct) =>
{
    RequireCsrf(context); var result = await identity.Refresh(context.Request.Cookies[cookieName] ?? "", ct);
    SetRefresh(context, result); return Results.Ok(PublicResult(result));
}).AllowAnonymous().RequireRateLimiting("auth");
auth.MapPost("/logout", async (IIdentityService identity, HttpContext context, CancellationToken ct) =>
{
    RequireCsrf(context); await identity.Logout(context.Request.Cookies[cookieName], ct);
    context.Response.Cookies.Delete(cookieName, new CookieOptions { Secure = true, HttpOnly = true, SameSite = SameSiteMode.Strict, Path = "/" });
    return Results.NoContent();
}).AllowAnonymous().RequireRateLimiting("auth");
auth.MapGet("/session", async (IIdentityService identity, HttpContext context, CancellationToken ct) =>
{
    var subject = Subject(context); return Results.Ok(await identity.Session(subject.User, subject.Session, false, ct));
}).RequireAuthorization();
auth.MapPost("/activity", async (IIdentityService identity, HttpContext context, CancellationToken ct) =>
{
    var subject = Subject(context); return Results.Ok(await identity.Session(subject.User, subject.Session, true, ct));
}).RequireAuthorization();
auth.MapPost("/password/change", async (PasswordRequest request, IIdentityService identity, HttpContext context, CancellationToken ct) =>
{
    RequireCsrf(context); var subject = Subject(context);
    var result = await identity.ChangePassword(subject.User, subject.Session, request, context.Request.Cookies[cookieName], ct);
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
app.MapGet("/api/health", () => Results.Ok(new { status = "ok", database = "not-checked" })).AllowAnonymous();
app.Run();

public partial class Program;
