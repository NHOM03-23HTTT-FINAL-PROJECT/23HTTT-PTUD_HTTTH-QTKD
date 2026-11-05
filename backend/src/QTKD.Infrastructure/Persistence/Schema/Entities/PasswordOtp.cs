using UserRole = QTKD.Domain.Identity.UserRole;
using UserStatus = QTKD.Domain.Identity.UserStatus;
using SessionEndReason = QTKD.Domain.Identity.SessionEndReason;
using RecordType = QTKD.Domain.Notifications.RecordType;
using SendStatus = QTKD.Domain.Notifications.SendStatus;

namespace QTKD.Infrastructure.Persistence.Schema;

/// <summary>qtkd.password_otp</summary>
public sealed class PasswordOtp
{
    public Guid OtpId { get; set; }
    public Guid UserId { get; set; }
    public string OtpHash { get; set; } = "";
    public DateTime ExpiresAt { get; set; }
    public int FailedCount { get; set; }
    public bool IsUsed { get; set; }
    public DateTime SentAt { get; set; }
}
