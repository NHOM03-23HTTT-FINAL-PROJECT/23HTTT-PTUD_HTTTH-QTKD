using UserRole = QTKD.Domain.Identity.UserRole;
using UserStatus = QTKD.Domain.Identity.UserStatus;
using SessionEndReason = QTKD.Domain.Identity.SessionEndReason;
using RecordType = QTKD.Domain.Notifications.RecordType;
using SendStatus = QTKD.Domain.Notifications.SendStatus;

namespace QTKD.Infrastructure.Persistence.Schema;

/// <summary>qtkd.contract_delivery</summary>
public sealed class ContractDelivery
{
    public Guid DeliveryId { get; set; }
    public Guid ContractId { get; set; }
    public Guid RequestId { get; set; }
    public string Destination { get; set; } = "";
    public string Payload { get; set; } = "";
    public string Status { get; set; } = "";
    public DateTime CreatedAt { get; set; }
    public int Attempts { get; set; }
    public DateTime? DeliveredAt { get; set; }
}
