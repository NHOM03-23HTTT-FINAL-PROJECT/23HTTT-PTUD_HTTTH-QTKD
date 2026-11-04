using UserRole = QTKD.Domain.Identity.UserRole;
using UserStatus = QTKD.Domain.Identity.UserStatus;
using SessionEndReason = QTKD.Domain.Identity.SessionEndReason;
using RecordType = QTKD.Domain.Notifications.RecordType;
using SendStatus = QTKD.Domain.Notifications.SendStatus;

namespace QTKD.Infrastructure.Persistence.Schema;

/// <summary>qtkd.price_list</summary>
public sealed class PriceList
{
    public Guid PriceListId { get; set; }
    public Guid ContractId { get; set; }
    public int Version { get; set; }
    public DateOnly EffectiveFrom { get; set; }
    public DateOnly EffectiveTo { get; set; }
    public PriceListStatus Status { get; set; }
    public Guid CreatedBy { get; set; }
}
