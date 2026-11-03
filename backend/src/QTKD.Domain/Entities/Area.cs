using QTKD.Domain.Enums;

namespace QTKD.Domain.Entities;

public class Area
{
    public Guid AreaId { get; set; }
    public string AreaCode { get; set; } = string.Empty;
    public string AreaName { get; set; } = string.Empty;
    public string AreaType { get; set; } = string.Empty;
    public Guid? ParentAreaId { get; set; }
    public int Level { get; set; }
    public string HierarchyPath { get; set; } = string.Empty;
    public string? Coordinates { get; set; }
    public decimal AreaM2 { get; set; }
    public decimal Capacity { get; set; }
    public string? TechnicalDescription { get; set; }
    public ActiveStatus Status { get; set; } = ActiveStatus.Active;
    public int RowVersion { get; set; } = 1;

    // Navigation
    public Area? ParentArea { get; set; }
    public ICollection<Area> SubAreas { get; set; } = new List<Area>();
    public ICollection<AreaService> AreaServices { get; set; } = new List<AreaService>();
    public ICollection<AreaAssignment> AreaAssignments { get; set; } = new List<AreaAssignment>();
}

