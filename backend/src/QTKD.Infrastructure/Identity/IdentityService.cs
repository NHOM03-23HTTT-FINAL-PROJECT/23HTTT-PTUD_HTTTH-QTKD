using System.Net.Mail;
using System.Text;
using System.Text.RegularExpressions;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using QTKD.Application.Features.Identity;
using QTKD.Domain.Identity;
using QTKD.Infrastructure.Persistence;

namespace QTKD.Infrastructure.Identity;

public sealed class IdentityService(IdentityDbContext db, UserManager<UserAccount> users, TokenIssuer tokens,
    IOptionsMonitor<TokenOptions> options, TimeProvider clock, ILogger<IdentityService> log) : IIdentityService
{
    private DateTime Now => clock.GetUtcNow().UtcDateTime;
    private static readonly string DummyHash = BCrypt.Net.BCrypt.HashPassword(Convert.ToHexString(System.Security.Cryptography.RandomNumberGenerator.GetBytes(16)), 12);
    private TimeSpan Idle => TimeSpan.FromMinutes(options.CurrentValue.IdleMinutes);

    public async Task<AuthResult> Login(LoginRequest request, string? ip, string? device, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(request.Identifier) || request.Identifier.Length > 254 || string.IsNullOrEmpty(request.Password) || Encoding.UTF8.GetByteCount(request.Password) > 72)
            throw new IdentityFailure(400, "VALIDATION");
        var identifier = request.Identifier.Trim().ToLowerInvariant();
        var candidate = await db.Users.AsNoTracking().SingleOrDefaultAsync(x => x.Username.ToLower() == identifier || x.CompanyEmail.ToLower() == identifier, ct);
        if (candidate is null)
        {
            BCrypt.Net.BCrypt.Verify(request.Password, DummyHash);
            log.LogWarning("LOGIN_FAILED {Reason}", "invalid-credentials");
            throw new IdentityFailure(401, "INVALID_CREDENTIALS");
        }
        await using var transaction = await db.Database.BeginTransactionAsync(ct);
        await db.LockUser(candidate.UserId, ct);
        var user = await db.Users.SingleAsync(x => x.UserId == candidate.UserId, ct);
        if (!await users.CheckPasswordAsync(user, request.Password))
        {
            if (user.Status != UserStatus.Disabled && (user.LockedUntil is null || user.LockedUntil <= Now))
            {
                if (user.LockedUntil is not null) user.FailedLoginCount = 0;
                user.FailedLoginCount++;
                if (user.FailedLoginCount >= 5) { user.LockedUntil = Now.AddMinutes(15); user.Status = UserStatus.TemporarilyLocked; await db.RevokeSessions(user.UserId, "locked", ct); }
            }
            db.Audit("LOGIN_FAILED", user.UserId, ip, Now, new { reason = "wrong-password", failedCount = user.FailedLoginCount, locked = user.LockedUntil > Now });
            await db.SaveChangesAsync(ct);
            await transaction.CommitAsync(ct);
            log.LogWarning("LOGIN_FAILED {UserId}", user.UserId);
            throw new IdentityFailure(401, "INVALID_CREDENTIALS");
        }
        if (user.Status == UserStatus.Disabled) throw new IdentityFailure(403, "DISABLED");
        if (user.LockedUntil > Now) throw new IdentityFailure(423, "LOCKED", lockedUntil: user.LockedUntil);
        // Role mapping/configuration is validated BEFORE a session is inserted.
        var view = await View(user, ct);
        var previous = await db.Sessions.Where(x => x.UserId == user.UserId).OrderByDescending(x => x.CreatedAt)
            .Select(x => new LoginTrace(x.CreatedAt, x.Device ?? "Không xác định")).FirstOrDefaultAsync(ct);
        user.Status = UserStatus.Active; user.LockedUntil = null; user.FailedLoginCount = 0;
        var refresh = TokenIssuer.NewSessionToken();
        var session = new LoginSession { UserId = user.UserId, RefreshTokenHash = TokenIssuer.Hash(refresh), LogoutTokenHash = TokenIssuer.Hash(refresh[..64]), CreatedAt = Now,
            LastActivityAt = Now, ExpiresAt = Now.AddHours(options.CurrentValue.AbsoluteHours), Remember = request.Remember,
            IpAddress = ip, Device = device?[..Math.Min(device.Length, 500)] };
        db.Sessions.Add(session);
        db.Audit("LOGIN_SUCCESS", user.UserId, ip, Now, new { device = session.Device });
        await db.SaveChangesAsync(ct); await transaction.CommitAsync(ct);
        log.LogInformation("LOGIN_SUCCESS {UserId} {SessionId}", user.UserId, session.SessionId);
        return Result(user, session, view, refresh, previous);
    }

    public async Task<AuthResult> Refresh(string token, CancellationToken ct)
    {
        var candidate = await FindRefresh(token, ct) ?? throw new IdentityFailure(401, "expired");
        await using var transaction = await db.Database.BeginTransactionAsync(ct);
        await db.LockUser(candidate.UserId, ct);
        var session = await FindRefresh(token, ct, tracked: true) ?? throw new IdentityFailure(401, "expired");
        var user = await Valid(session.UserId, session, ct);
        var refresh = token[..65] + TokenIssuer.NewRefresh(); session.RefreshTokenHash = TokenIssuer.Hash(refresh);
        var view = await View(user, ct);
        await db.SaveChangesAsync(ct); await transaction.CommitAsync(ct);
        return Result(user, session, view, refresh);
    }
    public async Task Logout(string? token, string? ip, bool audit, CancellationToken ct)
    {
        var candidate = await FindLogout(token, ct);
        if (candidate is null) return;
        await using var transaction = await db.Database.BeginTransactionAsync(ct);
        await db.LockUser(candidate.UserId, ct);
        var session = await FindLogout(token, ct, tracked: true);
        if (session is not null && !session.IsRevoked)
        {
            var reason = Now >= session.ExpiresAt || Now >= session.LastActivityAt + Idle ? SessionEndReason.Expired : SessionEndReason.Logout;
            Revoke(session, reason, "logout");
            // Only a deliberate sign-out is recorded; an expired session ending is not a user action.
            if (audit && reason == SessionEndReason.Logout) db.Audit("LOGOUT", session.UserId, ip, Now);
            await db.SaveChangesAsync(ct);
            log.LogInformation("LOGOUT {UserId} {SessionId}", session.UserId, session.SessionId);
        }
        await transaction.CommitAsync(ct);
    }
    public async Task<SessionView> Session(Guid userId, Guid sessionId, bool activity, CancellationToken ct)
    {
        if (activity)
        {
            await using var transaction = await db.Database.BeginTransactionAsync(ct);
            await db.LockUser(userId, ct);
            var session = await db.Sessions.SingleOrDefaultAsync(x => x.SessionId == sessionId, ct) ?? throw new IdentityFailure(401, "expired");
            var user = await Valid(userId, session, ct);
            session.LastActivityAt = Now;
            await db.SaveChangesAsync(ct); await transaction.CommitAsync(ct);
            return new("active", await View(user, ct), session.CreatedAt, session.LastActivityAt + Idle, session.ExpiresAt);
        }
        var current = await db.Sessions.AsNoTracking().SingleOrDefaultAsync(x => x.SessionId == sessionId, ct) ?? throw new IdentityFailure(401, "expired");
        var account = await Valid(userId, current, ct);
        return new("active", await View(account, ct), current.CreatedAt, current.LastActivityAt + Idle, current.ExpiresAt);
    }
    public async Task<AuthResult> ChangePassword(Guid userId, Guid sessionId, PasswordRequest request, string? refreshCookie, string? ip, CancellationToken ct)
    {
        if (string.IsNullOrEmpty(request.CurrentPassword) || Encoding.UTF8.GetByteCount(request.CurrentPassword) > 72)
            throw new IdentityFailure(400, "VALIDATION");
        await using var transaction = await db.Database.BeginTransactionAsync(ct);
        await db.LockUser(userId, ct);
        var session = await db.Sessions.SingleOrDefaultAsync(x => x.SessionId == sessionId, ct) ?? throw new IdentityFailure(401, "expired");
        var user = await Valid(userId, session, ct);
        if (!TokenIssuer.IsSessionToken(refreshCookie) || TokenIssuer.Hash(refreshCookie![..64]) != session.LogoutTokenHash)
            throw new IdentityFailure(401, "expired");
        if (!await users.CheckPasswordAsync(user, request.CurrentPassword))
        {
            user.FailedLoginCount++;
            if (user.FailedLoginCount >= 5)
            {
                user.Status = UserStatus.TemporarilyLocked; user.LockedUntil = Now.AddMinutes(15);
                await db.RevokeSessions(userId, "locked", ct);
            }
            await db.SaveChangesAsync(ct); await transaction.CommitAsync(ct);
            throw new IdentityFailure(400, user.FailedLoginCount >= 5 ? "LOCKED" : "WRONG_CURRENT", Math.Max(0, 5 - user.FailedLoginCount));
        }
        ValidatePassword(request.NewPassword);
        if (request.NewPassword == request.CurrentPassword) throw new IdentityFailure(400, "SAME_AS_CURRENT");
        var changed = await users.ChangePasswordAsync(user, request.CurrentPassword, request.NewPassword);
        if (!changed.Succeeded) throw new IdentityFailure(400, "WEAK_PASSWORD");
        user.MustChangePassword = false; user.PasswordChangedAt = Now; user.FailedLoginCount = 0;
        await db.InvalidatePasswordRecovery(userId, ct);
        await db.RevokeSessions(userId, "password-changed", ct, sessionId);
        var refresh = refreshCookie![..65] + TokenIssuer.NewRefresh(); session.RefreshTokenHash = TokenIssuer.Hash(refresh); session.LastActivityAt = Now;
        var view = await View(user, ct);
        db.Audit("PASSWORD_CHANGED", userId, ip, Now);
        await db.SaveChangesAsync(ct); await transaction.CommitAsync(ct);
        log.LogInformation("PASSWORD_CHANGED {UserId} {SessionId}", userId, sessionId);
        return Result(user, session, view, refresh);
    }
    public async Task<bool> HasPermission(Guid userId, string permission, CancellationToken ct)
    {
        var user = await db.Users.AsNoTracking().SingleOrDefaultAsync(x => x.UserId == userId, ct);
        return user is not null && user.Status == UserStatus.Active && !user.MustChangePassword
            && await db.Grants.AnyAsync(x => x.Role == user.Role && x.PermissionCode == permission, ct);
    }
    public async Task<IReadOnlyList<AuthUser>> Users(CancellationToken ct)
    {
        var accounts = await db.Users.AsNoTracking().OrderBy(x => x.Username).Take(200).ToListAsync(ct);
        var result = new List<AuthUser>(); foreach (var user in accounts) result.Add(await View(user, ct)); return result;
    }
    public async Task<AuthUser> User(Guid userId, CancellationToken ct)
    {
        var user = await db.Users.AsNoTracking().SingleOrDefaultAsync(x => x.UserId == userId, ct) ?? throw new IdentityFailure(404, "NOT_FOUND");
        return await View(user, ct);
    }
    public async Task<AuthUser> CreateUser(CreateUserRequest request, CancellationToken ct)
    {
        var role = IdentityCodes.ParseRole(request.Role); ValidatePassword(request.Password);
        var username = request.Username?.Trim().ToLowerInvariant() ?? "";
        var email = request.Email?.Trim().ToLowerInvariant() ?? "";
        if (!Regex.IsMatch(username, "^[a-z0-9._-]{1,100}$") || !MailAddress.TryCreate(email, out var address)
            || address.Address != email || email.Length > 254 || string.IsNullOrWhiteSpace(request.FullName) || request.FullName.Length > 200)
            throw new IdentityFailure(400, "VALIDATION");
        await using var transaction = await db.Database.BeginTransactionAsync(ct);
        await db.LockAdministration(ct);
        await ValidateAssignment(role, request.DepartmentId, ct);
        if (await db.Users.AnyAsync(x => x.Username.ToLower() == username || x.CompanyEmail.ToLower() == email, ct)) throw new IdentityFailure(409, "DUPLICATE_USER");
        var user = new UserAccount { Username = username, CompanyEmail = email, FullName = request.FullName.Trim(), DepartmentId = request.DepartmentId, Role = role };
        var created = await users.CreateAsync(user, request.Password);
        if (!created.Succeeded) throw new IdentityFailure(400, "VALIDATION");
        await transaction.CommitAsync(ct);
        log.LogInformation("USER_CREATED {UserId}", user.UserId);
        return await View(user, ct);
    }
    public async Task<AuthUser> UpdateUser(Guid actorId, Guid userId, UpdateUserRequest request, CancellationToken ct)
    {
        var role = IdentityCodes.ParseRole(request.Role);
        if (!Enum.TryParse<UserStatus>(request.Status, out var status) || !Enum.IsDefined(status) || status == UserStatus.TemporarilyLocked
            || string.IsNullOrWhiteSpace(request.FullName) || request.FullName.Length > 200) throw new IdentityFailure(400, "VALIDATION");
        await using var transaction = await db.Database.BeginTransactionAsync(ct);
        await db.LockAdministration(ct); await db.LockUser(userId, ct);
        var user = await db.Users.SingleOrDefaultAsync(x => x.UserId == userId, ct) ?? throw new IdentityFailure(404, "NOT_FOUND");
        await ValidateAssignment(role, request.DepartmentId, ct);
        if (actorId == userId && (role != user.Role || status != user.Status || request.DepartmentId != user.DepartmentId)) throw new IdentityFailure(409, "SELF_ADMIN_CHANGE");
        if (user.Role == UserRole.SystemAdmin && user.Status == UserStatus.Active && (role != UserRole.SystemAdmin || status != UserStatus.Active)
            && !await db.Users.AnyAsync(x => x.UserId != userId && x.Role == UserRole.SystemAdmin && x.Status == UserStatus.Active, ct)) throw new IdentityFailure(409, "LAST_ADMIN");
        if (role != user.Role || status != user.Status || request.DepartmentId != user.DepartmentId) await db.RevokeSessions(userId, status == UserStatus.Disabled ? "disabled" : "permissions-changed", ct);
        if (status == UserStatus.Disabled) await db.InvalidatePasswordRecovery(userId, ct);
        user.FullName = request.FullName.Trim(); user.DepartmentId = request.DepartmentId; user.Role = role; user.Status = status;
        user.LockedUntil = null; user.FailedLoginCount = 0;
        await db.SaveChangesAsync(ct); await transaction.CommitAsync(ct);
        log.LogInformation("USER_UPDATED {ActorId} {UserId}", actorId, userId);
        return await View(user, ct);
    }
    public async Task<IReadOnlyList<Department>> Departments(CancellationToken ct) => await db.Departments.AsNoTracking().OrderBy(x => x.Code).ToListAsync(ct);
    public async Task<Department> SaveDepartment(Guid? id, DepartmentRequest request, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(request.Code) || !Regex.IsMatch(request.Code, "^[A-Z][A-Z0-9_]{1,15}$") || string.IsNullOrWhiteSpace(request.Name) || request.Name.Length > 200) throw new IdentityFailure(400, "VALIDATION");
        var department = id is null ? new Department { Code = request.Code } : await db.Departments.FindAsync([id.Value], ct) ?? throw new IdentityFailure(404, "NOT_FOUND");
        if (department.Code != request.Code) throw new IdentityFailure(409, "IMMUTABLE_CODE");
        if (await db.Departments.AnyAsync(x => x.Code == request.Code && x.DepartmentId != department.DepartmentId, ct)) throw new IdentityFailure(409, "DUPLICATE_DEPARTMENT");
        department.DepartmentName = request.Name.Trim(); if (id is null) db.Departments.Add(department);
        await db.SaveChangesAsync(ct); return department;
    }
    public async Task<object> Roles(CancellationToken ct)
    {
        var roles = await db.Roles.AsNoTracking().OrderBy(x => x.Name).ToListAsync(ct);
        var grants = await db.Grants.AsNoTracking().ToListAsync(ct);
        return roles.Select(x => new { code = IdentityCodes.RoleCodes[x.Code], name = x.Name, department = x.DepartmentCode,
            permissions = grants.Where(g => g.Role == x.Code).Select(g => g.PermissionCode).Order().ToArray() }).ToArray();
    }
    public Task<string[]> Permissions(CancellationToken ct) => db.Permissions.OrderBy(x => x.Code).Select(x => x.Code).ToArrayAsync(ct);
    public async Task SaveGrants(string code, string[] permissions, CancellationToken ct)
    {
        var role = IdentityCodes.ParseRole(code);
        if (permissions is null || permissions.Length > 100 || permissions.Distinct().Count() != permissions.Length) throw new IdentityFailure(400, "VALIDATION");
        await using var transaction = await db.Database.BeginTransactionAsync(ct);
        await db.LockAdministration(ct);
        if (!await db.Roles.AnyAsync(x => x.Code == role, ct)) throw new IdentityFailure(404, "NOT_FOUND");
        if (await db.Permissions.CountAsync(x => permissions.Contains(x.Code), ct) != permissions.Length) throw new IdentityFailure(400, "VALIDATION");
        if (role == UserRole.SystemAdmin && new[] { "users.manage", "roles.manage", "departments.manage" }.Any(x => !permissions.Contains(x))) throw new IdentityFailure(409, "ADMIN_PERMISSIONS_REQUIRED");
        await db.Grants.Where(x => x.Role == role).ExecuteDeleteAsync(ct);
        db.Grants.AddRange(permissions.Select(x => new RolePermission { Role = role, PermissionCode = x }));
        await db.SaveChangesAsync(ct); await transaction.CommitAsync(ct);
        log.LogInformation("ROLE_PERMISSIONS_CHANGED {Role} {Count}", code, permissions.Length);
    }

    private async Task<AuthUser> View(UserAccount user, CancellationToken ct)
    {
        var role = await db.Roles.AsNoTracking().SingleOrDefaultAsync(x => x.Code == user.Role, ct);
        var department = await db.Departments.AsNoTracking().SingleOrDefaultAsync(x => x.DepartmentId == user.DepartmentId, ct);
        if (role is null || department is null || !IdentityCodes.RoleCodes.TryGetValue(user.Role, out var code) || role.DepartmentCode != department.Code)
        {
            log.LogError("IDENTITY_CONFIGURATION_INVALID {UserId}", user.UserId);
            throw new IdentityFailure(500, "SYSTEM_ERROR");
        }
        return new(user.UserId, user.Username, user.CompanyEmail, user.FullName, department.Code, [code],
            await db.Grants.Where(x => x.Role == user.Role).OrderBy(x => x.PermissionCode).Select(x => x.PermissionCode).ToArrayAsync(ct), user.MustChangePassword, user.PasswordChangedAt, user.Status.ToString());
    }
    private async Task ValidateAssignment(UserRole role, Guid departmentId, CancellationToken ct)
    {
        var definition = await db.Roles.AsNoTracking().SingleOrDefaultAsync(x => x.Code == role, ct) ?? throw new IdentityFailure(500, "SYSTEM_ERROR");
        if (!await db.Departments.AnyAsync(x => x.DepartmentId == departmentId && x.Code == definition.DepartmentCode, ct)) throw new IdentityFailure(400, "INVALID_ROLE_DEPARTMENT");
    }
    private async Task<UserAccount> Valid(Guid userId, LoginSession session, CancellationToken ct)
    {
        if (session.UserId != userId || session.IsRevoked) throw new IdentityFailure(401, session.RevocationReason ?? "expired");
        if (Now >= session.ExpiresAt || Now >= session.LastActivityAt + Idle) throw new IdentityFailure(401, "expired");
        var user = await db.Users.SingleOrDefaultAsync(x => x.UserId == userId, ct) ?? throw new IdentityFailure(401, "disabled");
        if (user.Status == UserStatus.Disabled) throw new IdentityFailure(401, "disabled");
        if (user.LockedUntil > Now) throw new IdentityFailure(401, "locked");
        return user;
    }
    private Task<LoginSession?> FindRefresh(string? token, CancellationToken ct, bool tracked = false)
    {
        if (!TokenIssuer.IsSessionToken(token)) return Task.FromResult<LoginSession?>(null);
        var hash = TokenIssuer.Hash(token!);
        return (tracked ? db.Sessions : db.Sessions.AsNoTracking()).SingleOrDefaultAsync(x => x.RefreshTokenHash == hash, ct);
    }
    private Task<LoginSession?> FindLogout(string? token, CancellationToken ct, bool tracked = false)
    {
        if (!TokenIssuer.IsSessionToken(token)) return Task.FromResult<LoginSession?>(null);
        var hash = TokenIssuer.Hash(token![..64]);
        return (tracked ? db.Sessions : db.Sessions.AsNoTracking()).SingleOrDefaultAsync(x => x.LogoutTokenHash == hash, ct);
    }
    private static void Revoke(LoginSession session, SessionEndReason reason, string detail) { session.IsRevoked = true; session.EndReason = reason; session.RevocationReason = detail; }
    private AuthResult Result(UserAccount user, LoginSession session, AuthUser view, string refresh, LoginTrace? previous = null)
    {
        var jwt = tokens.Issue(user, session);
        return new(jwt.Token, jwt.ExpiresAt, view, session.CreatedAt, session.LastActivityAt + Idle, session.ExpiresAt, previous, refresh, session.Remember);
    }
    public static void ValidatePassword(string? password)
    {
        if (password is null || password.Length < 12 || Encoding.UTF8.GetByteCount(password) > 72 || !password.Any(char.IsUpper)
            || !password.Any(char.IsLower) || !password.Any(char.IsDigit) || !password.Any(c => !char.IsLetterOrDigit(c))) throw new IdentityFailure(400, "WEAK_PASSWORD");
    }
}
