using QTKD.Domain.Identity;

namespace QTKD.Application.Features.Identity;

public sealed record LoginRequest(string Identifier, string Password, bool Remember = false);
public sealed record PasswordRequest(string CurrentPassword, string NewPassword);
public sealed record AuthUser(Guid Id, string Username, string Email, string FullName, string Department,
    string[] Roles, string[] Permissions, bool MustChangePassword, DateTime? PasswordChangedAt, string Status);
public sealed record LoginTrace(DateTime At, string Client);
public sealed record AuthResult(string AccessToken, DateTime AccessTokenExpiresAt, AuthUser User,
    DateTime SignedInAt, DateTime IdleExpiresAt, DateTime ExpiresAt, LoginTrace? PreviousLogin,
    string RefreshToken, bool Remember);
public sealed record SessionView(string Status, AuthUser User, DateTime SignedInAt, DateTime IdleExpiresAt, DateTime ExpiresAt);
public sealed record CreateUserRequest(string Username, string Email, string FullName, Guid DepartmentId, string? Role, string Password);
public sealed record UpdateUserRequest(string FullName, Guid DepartmentId, string? Role, string Status);
public sealed record DepartmentRequest(string Code, string Name);
public sealed record GrantsRequest(string[] Permissions);
public sealed record ResourceAccess(string Permission, bool InScope, Guid? OwnerId = null, Guid? AssigneeId = null, bool StateAllowsAction = true);

public sealed class IdentityFailure(int status, string code, int? remainingAttempts = null, DateTime? lockedUntil = null) : Exception(code)
{
    public int Status { get; } = status;
    public string Code { get; } = code;
    public int? RemainingAttempts { get; } = remainingAttempts;
    public DateTime? LockedUntil { get; } = lockedUntil;
}

public interface IIdentityService
{
    Task<AuthResult> Login(LoginRequest request, string? ip, string? device, CancellationToken ct);
    Task<AuthResult> Refresh(string token, CancellationToken ct);
    Task Logout(string? token, CancellationToken ct);
    Task<SessionView> Session(Guid userId, Guid sessionId, bool activity, CancellationToken ct);
    Task<AuthResult> ChangePassword(Guid userId, Guid sessionId, PasswordRequest request, string? refreshCookie, CancellationToken ct);
    Task<bool> HasPermission(Guid userId, string permission, CancellationToken ct);
    Task<IReadOnlyList<AuthUser>> Users(CancellationToken ct);
    Task<AuthUser> User(Guid userId, CancellationToken ct);
    Task<AuthUser> CreateUser(CreateUserRequest request, CancellationToken ct);
    Task<AuthUser> UpdateUser(Guid actorId, Guid userId, UpdateUserRequest request, CancellationToken ct);
    Task<IReadOnlyList<Department>> Departments(CancellationToken ct);
    Task<Department> SaveDepartment(Guid? id, DepartmentRequest request, CancellationToken ct);
    Task<object> Roles(CancellationToken ct);
    Task<string[]> Permissions(CancellationToken ct);
    Task SaveGrants(string role, string[] permissions, CancellationToken ct);
}

public static class IdentityCodes
{
    public static readonly IReadOnlyDictionary<UserRole, string> RoleCodes = new Dictionary<UserRole, string>
    {
        [UserRole.SalesStaff] = "NV_KD", [UserRole.SalesManager] = "TP_KD",
        [UserRole.OperationsStaff] = "NV_KT", [UserRole.OperationsManager] = "TP_KT",
        [UserRole.Accountant] = "NV_KTOAN", [UserRole.LegalStaff] = "NV_PC", [UserRole.LegalManager] = "TP_PC",
        [UserRole.BoardMember] = "GD", [UserRole.BoardChair] = "TGD", [UserRole.SystemAdmin] = "QTHT"
    };
    public static UserRole ParseRole(string? code) => RoleCodes.FirstOrDefault(x => x.Value == code) is var pair
        && code is not null && pair.Value is not null ? pair.Key : throw new IdentityFailure(400, "VALIDATION");
}
