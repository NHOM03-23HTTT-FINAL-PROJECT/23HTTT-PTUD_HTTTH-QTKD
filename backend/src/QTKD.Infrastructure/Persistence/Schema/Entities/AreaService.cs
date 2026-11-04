using UserRole = QTKD.Domain.Identity.UserRole;
using UserStatus = QTKD.Domain.Identity.UserStatus;
using SessionEndReason = QTKD.Domain.Identity.SessionEndReason;
using RecordType = QTKD.Domain.Notifications.RecordType;
using SendStatus = QTKD.Domain.Notifications.SendStatus;

namespace QTKD.Infrastructure.Persistence.Schema;

/// <summary>qtkd.area_service</summary>
public sealed class AreaService
{
    public Guid AreaId { get; set; }
    public Guid ServiceId { get; set; }
}
