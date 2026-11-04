using UserRole = QTKD.Domain.Identity.UserRole;
using UserStatus = QTKD.Domain.Identity.UserStatus;
using SessionEndReason = QTKD.Domain.Identity.SessionEndReason;
using RecordType = QTKD.Domain.Notifications.RecordType;
using SendStatus = QTKD.Domain.Notifications.SendStatus;

namespace QTKD.Infrastructure.Persistence.Schema;

/// <summary>qtkd.price_list_line</summary>
public sealed class PriceListLine
{
    public Guid LineId { get; set; }
    public Guid PriceListId { get; set; }
    public Guid ServiceId { get; set; }
    public Guid AreaId { get; set; }
    public decimal UnitPrice { get; set; }
    public string Unit { get; set; } = "";
}
