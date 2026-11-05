using UserRole = QTKD.Domain.Identity.UserRole;
using UserStatus = QTKD.Domain.Identity.UserStatus;
using SessionEndReason = QTKD.Domain.Identity.SessionEndReason;
using RecordType = QTKD.Domain.Notifications.RecordType;
using SendStatus = QTKD.Domain.Notifications.SendStatus;

namespace QTKD.Infrastructure.Persistence.Schema;

/// <summary>qtkd.idempotency_request</summary>
public sealed class IdempotencyRequest
{
    public Guid ActorId { get; set; }
    public string Operation { get; set; } = "";
    public string Key { get; set; } = "";
    public string Fingerprint { get; set; } = "";
    public string Response { get; set; } = "";
    public DateTime CreatedAt { get; set; }
}
