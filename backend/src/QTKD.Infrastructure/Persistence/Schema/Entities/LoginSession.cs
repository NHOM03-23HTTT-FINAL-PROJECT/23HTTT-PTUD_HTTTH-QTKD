using UserRole = QTKD.Domain.Identity.UserRole;
using UserStatus = QTKD.Domain.Identity.UserStatus;
using SessionEndReason = QTKD.Domain.Identity.SessionEndReason;
using RecordType = QTKD.Domain.Notifications.RecordType;
using SendStatus = QTKD.Domain.Notifications.SendStatus;

namespace QTKD.Infrastructure.Persistence.Schema;

/// <summary>qtkd.login_session</summary>
public sealed class LoginSession
{
    public Guid SessionId { get; set; }
    public Guid UserId { get; set; }
    public string RefreshTokenHash { get; set; } = "";
    public string LogoutTokenHash { get; set; } = "";
    public DateTime CreatedAt { get; set; }
    public DateTime LastActivityAt { get; set; }
    public bool Remember { get; set; }
    public string? RevocationReason { get; set; }
    public DateTime ExpiresAt { get; set; }
    public bool IsRevoked { get; set; }
    public SessionEndReason? EndReason { get; set; }
    public string? IpAddress { get; set; }
    public string? Device { get; set; }
}
