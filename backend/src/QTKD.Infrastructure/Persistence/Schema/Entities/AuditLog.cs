using UserRole = QTKD.Domain.Identity.UserRole;
using UserStatus = QTKD.Domain.Identity.UserStatus;
using SessionEndReason = QTKD.Domain.Identity.SessionEndReason;
using RecordType = QTKD.Domain.Notifications.RecordType;
using SendStatus = QTKD.Domain.Notifications.SendStatus;

namespace QTKD.Infrastructure.Persistence.Schema;

/// <summary>qtkd.audit_log</summary>
public sealed class AuditLog
{
    public Guid LogId { get; set; }
    public string EntityType { get; set; } = "";
    public Guid? EntityId { get; set; }
    public string Action { get; set; } = "";
    public Guid? ActorId { get; set; }
    public DateTime ActedAt { get; set; }
    public string? StatusBefore { get; set; }
    public string? StatusAfter { get; set; }
    public string? ValueBefore { get; set; }
    public string? ValueAfter { get; set; }
    public string? Note { get; set; }
    public string? IpAddress { get; set; }
}
