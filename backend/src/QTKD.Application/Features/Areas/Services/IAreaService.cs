using QTKD.Application.Features.Areas.Dtos;

namespace QTKD.Application.Features.Areas.Services;

public interface IAreaService
{
    Task<PagedResult<AreaDto>> SearchAreasAsync(AreaFilterQuery query, CancellationToken ct = default);
    Task<List<AreaNodeDto>> GetAreaTreeAsync(CancellationToken ct = default);
    Task<List<AreaLookupDto>> GetActiveLookupAsync(CancellationToken ct = default);
    Task<AreaDto?> GetByIdOrCodeAsync(string idOrCode, CancellationToken ct = default);
    Task<AreaDto> CreateAreaAsync(CreateAreaDto dto, CancellationToken ct = default);
    Task<AreaDto> UpdateAreaAsync(string idOrCode, UpdateAreaDto dto, CancellationToken ct = default);
    Task<AreaDto> ChangeParentAsync(string idOrCode, ChangeAreaParentDto dto, CancellationToken ct = default);
    Task<AreaDto> ChangeStatusAsync(string idOrCode, ChangeAreaStatusDto dto, CancellationToken ct = default);
    Task<AreaAssignmentSummaryDto> AssignStaffAsync(string idOrCode, AssignStaffDto dto, CancellationToken ct = default);
    Task<bool> EndStaffAsync(string idOrCode, string assignmentIdOrStaffCode, CancellationToken ct = default);
    Task<List<AreaServiceSummaryDto>> SetServicesAsync(string idOrCode, SetServicesDto dto, CancellationToken ct = default);
    Task<AreaOperationCatalogsDto> GetOperationCatalogsAsync(CancellationToken ct = default);
    Task<AreaDashboardDto> GetDashboardAsync(CancellationToken ct = default);
    Task<List<AreaPriceListDto>> GetPriceListsAsync(string idOrCode, CancellationToken ct = default);
    Task<AreaContractsDto> GetContractsAsync(string idOrCode, CancellationToken ct = default);
}

