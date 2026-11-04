using QTKD.Domain.Enums;

namespace QTKD.Application.Features.Areas.Dtos;

public class CreateAreaDto
{
    public string AreaCode { get; set; } = string.Empty;
    public string AreaName { get; set; } = string.Empty;
    public string AreaType { get; set; } = string.Empty;
    public Guid? ParentAreaId { get; set; }
    public string? Coordinates { get; set; }
    public decimal AreaM2 { get; set; }
    public decimal Capacity { get; set; }
    public string? TechnicalDescription { get; set; }
}

public class UpdateAreaDto
{
    public string AreaName { get; set; } = string.Empty;
    public string AreaType { get; set; } = string.Empty;
    public string? Coordinates { get; set; }
    public decimal AreaM2 { get; set; }
    public decimal Capacity { get; set; }
    public string? TechnicalDescription { get; set; }
    public int RowVersion { get; set; }
}

public class ChangeAreaParentDto
{
    public Guid? NewParentAreaId { get; set; }
    public string? NewParentCode { get; set; }
    public int RowVersion { get; set; }
}

public class ChangeAreaStatusDto
{
    public ActiveStatus Status { get; set; }
    public string? Reason { get; set; }
    public int RowVersion { get; set; }
}

public class AreaFilterQuery
{
    public string? Keyword { get; set; }
    public ActiveStatus? Status { get; set; }
    public string? AreaType { get; set; }
    public int? Level { get; set; }
    public Guid? ParentAreaId { get; set; }
    public string? ParentCode { get; set; }
    public int PageNumber { get; set; } = 1;
    public int PageSize { get; set; } = 20;
}

public class AssignStaffDto
{
    public Guid? UserId { get; set; }
    public string? StaffCode { get; set; }
    public string? Title { get; set; }
    public string? Shift { get; set; }
    public DateTime FromDate { get; set; } = DateTime.UtcNow;
    public DateTime? ToDate { get; set; }
}

public class SetServicesDto
{
    public List<Guid> ServiceIds { get; set; } = new();
    public List<string>? ServiceNames { get; set; }
}

public class AreaDto
{
    public Guid AreaId { get; set; }
    public string AreaCode { get; set; } = string.Empty;
    public string AreaName { get; set; } = string.Empty;
    public string AreaType { get; set; } = string.Empty;
    public Guid? ParentAreaId { get; set; }
    public string? ParentAreaName { get; set; }
    public string? ParentAreaCode { get; set; }
    public int Level { get; set; }
    public string HierarchyPath { get; set; } = string.Empty;
    public string? Coordinates { get; set; }
    public decimal AreaM2 { get; set; }
    public decimal Capacity { get; set; }
    public string? TechnicalDescription { get; set; }
    public ActiveStatus Status { get; set; }
    public int RowVersion { get; set; }
    public List<AreaServiceSummaryDto> Services { get; set; } = new();
    public List<AreaAssignmentSummaryDto> Assignments { get; set; } = new();
    public List<AreaHistoryEntryDto> History { get; set; } = new();
}

public class AreaHistoryEntryDto
{
    public string Kind { get; set; } = "status";
    public string Action { get; set; } = string.Empty;
    public string By { get; set; } = string.Empty;
    public string ByTitle { get; set; } = string.Empty;
    public string At { get; set; } = string.Empty;
    public int Version { get; set; }
    public string Detail { get; set; } = string.Empty;
    public string? Reason { get; set; }
}

public class AreaServiceSummaryDto
{
    public Guid ServiceId { get; set; }
    public string ServiceName { get; set; } = string.Empty;
    public string Unit { get; set; } = string.Empty;
    public bool IsMandatory { get; set; }
}

public class AreaAssignmentSummaryDto
{
    public Guid AssignmentId { get; set; }
    public Guid UserId { get; set; }
    public string StaffName { get; set; } = string.Empty;
    public string Username { get; set; } = string.Empty;
    public DateTime FromDate { get; set; }
    public DateTime? ToDate { get; set; }
}

public class AreaNodeDto
{
    public Guid AreaId { get; set; }
    public string AreaCode { get; set; } = string.Empty;
    public string AreaName { get; set; } = string.Empty;
    public string AreaType { get; set; } = string.Empty;
    public int Level { get; set; }
    public string HierarchyPath { get; set; } = string.Empty;
    public decimal AreaM2 { get; set; }
    public decimal Capacity { get; set; }
    public ActiveStatus Status { get; set; }
    public List<AreaNodeDto> Children { get; set; } = new();
}

public class AreaLookupDto
{
    public Guid AreaId { get; set; }
    public string AreaCode { get; set; } = string.Empty;
    public string AreaName { get; set; } = string.Empty;
    public string AreaType { get; set; } = string.Empty;
    public int Level { get; set; }
    public string HierarchyPath { get; set; } = string.Empty;
}

public class PagedResult<T>
{
    public List<T> Items { get; set; } = new();
    public int TotalCount { get; set; }
    public int PageNumber { get; set; }
    public int PageSize { get; set; }
    public int TotalPages => (int)Math.Ceiling((double)TotalCount / (PageSize > 0 ? PageSize : 1));
}

public class ServiceCatalogItemDto
{
    public Guid ServiceId { get; set; }
    public string Name { get; set; } = string.Empty;
    public string Group { get; set; } = string.Empty;
    public string Unit { get; set; } = string.Empty;
}

public class StaffCatalogItemDto
{
    public Guid UserId { get; set; }
    public string Name { get; set; } = string.Empty;
    public string StaffCode { get; set; } = string.Empty;
    public string Phone { get; set; } = string.Empty;
    public string DefaultTitle { get; set; } = string.Empty;
}

public class AreaOperationCatalogsDto
{
    public List<ServiceCatalogItemDto> Services { get; set; } = new();
    public List<StaffCatalogItemDto> Staff { get; set; } = new();
}

public class AreaDashboardDto
{
    public int TotalAreas { get; set; }
    public int ActiveCount { get; set; }
    public int SuspendedCount { get; set; }
    public int Level1Count { get; set; }
    public List<string> Level1Names { get; set; } = new();
    public int Level2Count { get; set; }
    public int Level3Count { get; set; }
    public int IncompleteCount { get; set; }
    public List<AreaDto> RecentAreas { get; set; } = new();
    public List<AreaNodeDto> AreaTree { get; set; } = new();
}

public class AreaPriceListDto
{
    public string Code { get; set; } = string.Empty;
    public string Customer { get; set; } = string.Empty;
    public string Contract { get; set; } = string.Empty;
    public string Services { get; set; } = string.Empty;
    public string From { get; set; } = string.Empty;
    public string To { get; set; } = string.Empty;
    public string Status { get; set; } = "active";
}

public class AreaContractItemDto
{
    public string Code { get; set; } = string.Empty;
    public string Customer { get; set; } = string.Empty;
    public string From { get; set; } = string.Empty;
    public string To { get; set; } = string.Empty;
    public decimal Volume { get; set; }
    public string VolumeUnit { get; set; } = "container";
}

public class AreaOutputSummaryDto
{
    public string Period { get; set; } = string.Empty;
    public int Lifts { get; set; }
    public int StorageTeuDays { get; set; }
}

public class AreaContractsDto
{
    public List<AreaContractItemDto> Items { get; set; } = new();
    public AreaOutputSummaryDto? Output { get; set; }
}

