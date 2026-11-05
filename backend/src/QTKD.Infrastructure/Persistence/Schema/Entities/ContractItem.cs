using UserRole = QTKD.Domain.Identity.UserRole;
using UserStatus = QTKD.Domain.Identity.UserStatus;
using SessionEndReason = QTKD.Domain.Identity.SessionEndReason;
using RecordType = QTKD.Domain.Notifications.RecordType;
using SendStatus = QTKD.Domain.Notifications.SendStatus;

namespace QTKD.Infrastructure.Persistence.Schema;

/// <summary>qtkd.contract_item</summary>
public sealed class ContractItem
{
    public Guid ItemId { get; set; }
    public Guid ContractId { get; set; }
    public Guid ServiceId { get; set; }
    public Guid? AreaId { get; set; }
    public string AreaNameSnapshot { get; set; } = "";
}
