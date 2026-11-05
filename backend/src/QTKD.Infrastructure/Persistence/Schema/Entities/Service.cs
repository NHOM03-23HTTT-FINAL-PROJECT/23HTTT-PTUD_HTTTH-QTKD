using UserRole = QTKD.Domain.Identity.UserRole;
using UserStatus = QTKD.Domain.Identity.UserStatus;
using SessionEndReason = QTKD.Domain.Identity.SessionEndReason;
using RecordType = QTKD.Domain.Notifications.RecordType;
using SendStatus = QTKD.Domain.Notifications.SendStatus;

namespace QTKD.Infrastructure.Persistence.Schema;

/// <summary>qtkd.service</summary>
public sealed class Service
{
    public string ServiceCode { get; set; } = "";
    public bool RequiresArea { get; set; }
    public Guid ServiceId { get; set; }
    public string ServiceName { get; set; } = "";
    public string Unit { get; set; } = "";
    public bool IsMandatory { get; set; }
}
