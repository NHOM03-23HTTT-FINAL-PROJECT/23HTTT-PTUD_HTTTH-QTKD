namespace QTKD.Domain.Identity;

public enum UserRole { SalesStaff, SalesManager, OperationsStaff, OperationsManager, Accountant, LegalStaff, BoardMember, SystemAdmin }
public enum UserStatus { Active, TemporarilyLocked, Disabled }
public enum SessionEndReason { Logout, Expired, Revoked }

public sealed class UserAccount
{
    public Guid UserId { get; set; } = Guid.NewGuid();
    public string Username { get; set; } = "";
    public string CompanyEmail { get; set; } = "";
    public string PasswordHash { get; set; } = "";
    public string FullName { get; set; } = "";
    public Guid DepartmentId { get; set; }
    public UserRole Role { get; set; }
    public UserStatus Status { get; set; }
    public int FailedLoginCount { get; set; }
    public DateTime? LockedUntil { get; set; }
    public bool MustChangePassword { get; set; } = true;
    public bool CanSign { get; set; }
    public DateTime? PasswordChangedAt { get; set; }
}
public sealed class Department
{
    public Guid DepartmentId { get; set; } = Guid.NewGuid();
    public string DepartmentName { get; set; } = "";
    public string Code { get; set; } = "";
    public Guid? ManagerId { get; set; }
}
public sealed class RoleDefinition
{
    public UserRole Code { get; set; }
    public string Name { get; set; } = "";
    public string DepartmentCode { get; set; } = "";
}
public sealed class Permission
{
    public string Code { get; set; } = "";
    public string Name { get; set; } = "";
}
public sealed class RolePermission
{
    public UserRole Role { get; set; }
    public string PermissionCode { get; set; } = "";
}
public sealed class LoginSession
{
    public Guid SessionId { get; set; } = Guid.NewGuid();
    public Guid UserId { get; set; }
    public string RefreshTokenHash { get; set; } = "";
    public string LogoutTokenHash { get; set; } = "";
    public DateTime CreatedAt { get; set; }
    public DateTime ExpiresAt { get; set; }
    public DateTime LastActivityAt { get; set; }
    public bool Remember { get; set; }
    public bool IsRevoked { get; set; }
    public SessionEndReason? EndReason { get; set; }
    public string? RevocationReason { get; set; }
    public string? IpAddress { get; set; }
    public string? Device { get; set; }
}
