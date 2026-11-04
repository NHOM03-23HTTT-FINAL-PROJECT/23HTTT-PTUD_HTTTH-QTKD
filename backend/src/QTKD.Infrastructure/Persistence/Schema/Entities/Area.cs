using UserRole = QTKD.Domain.Identity.UserRole;
using UserStatus = QTKD.Domain.Identity.UserStatus;
using SessionEndReason = QTKD.Domain.Identity.SessionEndReason;
using RecordType = QTKD.Domain.Notifications.RecordType;
using SendStatus = QTKD.Domain.Notifications.SendStatus;

namespace QTKD.Infrastructure.Persistence.Schema;

/// <summary>qtkd.area</summary>
public sealed class Area
{
    public Guid AreaId { get; set; }
    public string AreaCode { get; set; } = "";
    public string AreaName { get; set; } = "";
    public string AreaType { get; set; } = "";
    public Guid? ParentAreaId { get; set; }
    public int Level { get; set; }
    public string HierarchyPath { get; set; } = "";
    public string? Coordinates { get; set; }
    public decimal AreaM2 { get; set; }
    public decimal Capacity { get; set; }
    public string? TechnicalDescription { get; set; }
    public ActiveStatus Status { get; set; }
    public int RowVersion { get; set; }
}
