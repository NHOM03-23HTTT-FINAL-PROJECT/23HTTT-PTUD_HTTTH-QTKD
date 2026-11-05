using UserRole = QTKD.Domain.Identity.UserRole;
using UserStatus = QTKD.Domain.Identity.UserStatus;
using SessionEndReason = QTKD.Domain.Identity.SessionEndReason;
using RecordType = QTKD.Domain.Notifications.RecordType;
using SendStatus = QTKD.Domain.Notifications.SendStatus;

namespace QTKD.Infrastructure.Persistence.Schema;

/// <summary>qtkd.volume_line</summary>
public sealed class VolumeLine
{
    public Guid VolumeLineId { get; set; }
    public Guid VolumePeriodId { get; set; }
    public Guid ServiceId { get; set; }
    public Guid AreaId { get; set; }
    public decimal Quantity { get; set; }
}
