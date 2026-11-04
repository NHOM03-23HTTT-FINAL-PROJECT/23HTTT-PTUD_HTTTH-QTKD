using UserRole = QTKD.Domain.Identity.UserRole;
using UserStatus = QTKD.Domain.Identity.UserStatus;
using SessionEndReason = QTKD.Domain.Identity.SessionEndReason;
using RecordType = QTKD.Domain.Notifications.RecordType;
using SendStatus = QTKD.Domain.Notifications.SendStatus;

namespace QTKD.Infrastructure.Persistence.Schema;

/// <summary>qtkd.volume_period</summary>
public sealed class VolumePeriod
{
    public Guid VolumePeriodId { get; set; }
    public Guid ContractId { get; set; }
    public string BillingPeriod { get; set; } = "";
    public VolumeStatus Status { get; set; }
    public Guid? LockedBy { get; set; }
    public DateTime? LockedAt { get; set; }
}
