using UserRole = QTKD.Domain.Identity.UserRole;
using UserStatus = QTKD.Domain.Identity.UserStatus;
using SessionEndReason = QTKD.Domain.Identity.SessionEndReason;
using RecordType = QTKD.Domain.Notifications.RecordType;
using SendStatus = QTKD.Domain.Notifications.SendStatus;

namespace QTKD.Infrastructure.Persistence.Schema;

/// <summary>qtkd.user_account</summary>
public sealed class UserAccount
{
    public Guid UserId { get; set; }
    public string Username { get; set; } = "";
    public string CompanyEmail { get; set; } = "";
    public string PasswordHash { get; set; } = "";
    public string FullName { get; set; } = "";
    public Guid DepartmentId { get; set; }
    public UserRole Role { get; set; }
    public UserStatus Status { get; set; }
    public int FailedLoginCount { get; set; }
    public DateTime? LockedUntil { get; set; }
    public bool MustChangePassword { get; set; }
    public bool CanSign { get; set; }
    public DateTime? PasswordChangedAt { get; set; }
}
