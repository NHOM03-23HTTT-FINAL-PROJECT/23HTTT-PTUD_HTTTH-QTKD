using UserRole = QTKD.Domain.Identity.UserRole;
using UserStatus = QTKD.Domain.Identity.UserStatus;
using SessionEndReason = QTKD.Domain.Identity.SessionEndReason;
using RecordType = QTKD.Domain.Notifications.RecordType;
using SendStatus = QTKD.Domain.Notifications.SendStatus;

namespace QTKD.Infrastructure.Persistence.Schema;

/// <summary>qtkd.role_definition</summary>
public sealed class RoleDefinition
{
    public UserRole Code { get; set; }
    public string Name { get; set; } = "";
    public string DepartmentCode { get; set; } = "";
}
