using UserRole = QTKD.Domain.Identity.UserRole;
using UserStatus = QTKD.Domain.Identity.UserStatus;
using SessionEndReason = QTKD.Domain.Identity.SessionEndReason;
using RecordType = QTKD.Domain.Notifications.RecordType;
using SendStatus = QTKD.Domain.Notifications.SendStatus;

namespace QTKD.Infrastructure.Persistence.Schema;

/// <summary>qtkd.department</summary>
public sealed class Department
{
    public Guid DepartmentId { get; set; }
    public string DepartmentName { get; set; } = "";
    public string Code { get; set; } = "";
    public Guid? ManagerId { get; set; }
}
