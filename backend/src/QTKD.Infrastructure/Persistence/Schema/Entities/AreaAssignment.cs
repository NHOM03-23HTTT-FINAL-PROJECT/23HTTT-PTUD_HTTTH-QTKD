using UserRole = QTKD.Domain.Identity.UserRole;
using UserStatus = QTKD.Domain.Identity.UserStatus;
using SessionEndReason = QTKD.Domain.Identity.SessionEndReason;
using RecordType = QTKD.Domain.Notifications.RecordType;
using SendStatus = QTKD.Domain.Notifications.SendStatus;

namespace QTKD.Infrastructure.Persistence.Schema;

/// <summary>qtkd.area_assignment</summary>
public sealed class AreaAssignment
{
    public Guid AssignmentId { get; set; }
    public Guid AreaId { get; set; }
    public Guid UserId { get; set; }
    public DateTime FromDate { get; set; }
    public DateTime? ToDate { get; set; }
}
