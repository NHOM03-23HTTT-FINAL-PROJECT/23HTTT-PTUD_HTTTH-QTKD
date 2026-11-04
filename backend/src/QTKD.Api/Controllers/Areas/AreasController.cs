using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using QTKD.Application.Features.Areas.Dtos;
using QTKD.Application.Features.Areas.Services;

namespace QTKD.Api.Controllers.Areas;

[ApiController]
[Route("api/v1/areas")]
public class AreasController : ControllerBase
{
    private readonly IAreaService _areaService;

    public AreasController(IAreaService areaService)
    {
        _areaService = areaService;
    }

    /// <summary>
    /// Tra cứu, tìm kiếm và phân trang danh sách khu vực khai thác (UC-ARE-12).
    /// </summary>
    [HttpGet]
    [Authorize(Policy = "areas.view")]
    [ProducesResponseType(typeof(PagedResult<AreaDto>), StatusCodes.Status200OK)]
    public async Task<IActionResult> SearchAreas([FromQuery] AreaFilterQuery query, CancellationToken ct)
    {
        var result = await _areaService.SearchAreasAsync(query, ct);
        return Ok(result);
    }

    /// <summary>
    /// Lấy toàn bộ cây sơ đồ phân cấp khu vực (phục vụ màn hình Tree View của TASK-043).
    /// </summary>
    [HttpGet("tree")]
    [Authorize(Policy = "areas.view")]
    [ProducesResponseType(typeof(List<AreaNodeDto>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetTree(CancellationToken ct)
    {
        var result = await _areaService.GetAreaTreeAsync(ct);
        return Ok(result);
    }

    /// <summary>
    /// API lookup danh sách khu vực Active gọn nhẹ phục vụ module Hợp đồng và chọn khu vực (TASK-042).
    /// </summary>
    [HttpGet("lookup")]
    [Authorize(Policy = "areas.view")]
    [ProducesResponseType(typeof(List<AreaLookupDto>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetLookup(CancellationToken ct)
    {
        var result = await _areaService.GetActiveLookupAsync(ct);
        return Ok(result);
    }

    /// <summary>
    /// Lấy danh mục dịch vụ cảng và nhân sự khai thác phục vụ các hộp thoại thao tác trên màn hình chi tiết (UC-ARE-13).
    /// </summary>
    [HttpGet("operation-catalogs")]
    [Authorize(Policy = "areas.view")]
    [ProducesResponseType(typeof(AreaOperationCatalogsDto), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetOperationCatalogs(CancellationToken ct)
    {
        var result = await _areaService.GetOperationCatalogsAsync(ct);
        return Ok(result);
    }

    /// <summary>
    /// Lấy dữ liệu tổng hợp cho trang chủ Bảng điều khiển Khai thác (Dashboard).
    /// </summary>
    [HttpGet("dashboard")]
    [Authorize(Policy = "areas.view")]
    [ProducesResponseType(typeof(AreaDashboardDto), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetDashboard(CancellationToken ct)
    {
        var dashboard = await _areaService.GetDashboardAsync(ct);
        return Ok(dashboard);
    }

    /// <summary>
    /// Xem chi tiết thông tin một khu vực theo mã hoặc ID (UC-ARE-13, TASK-042).
    /// </summary>
    [HttpGet("{idOrCode}")]
    [Authorize(Policy = "areas.view")]
    [ProducesResponseType(typeof(AreaDto), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> GetByIdOrCode(string idOrCode, CancellationToken ct)
    {
        var area = await _areaService.GetByIdOrCodeAsync(idOrCode, ct);
        if (area == null)
            return NotFound(new { statusCode = 404, error = $"Không tìm thấy khu vực '{idOrCode}'." });

        return Ok(area);
    }

    /// <summary>
    /// Tạo mới một khu vực khai thác, kiểm tra tối đa 3 cấp và chặn vòng lặp (UC-ARE-01, TASK-041).
    /// </summary>
    [HttpPost]
    [Authorize(Policy = "areas.create")]
    [ProducesResponseType(typeof(AreaDto), StatusCodes.Status201Created)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    public async Task<IActionResult> Create([FromBody] CreateAreaDto dto, CancellationToken ct)
    {
        var created = await _areaService.CreateAreaAsync(dto, ct);
        return CreatedAtAction(nameof(GetByIdOrCode), new { idOrCode = created.AreaCode }, created);
    }

    /// <summary>
    /// Cập nhật thông tin và quy chuẩn kỹ thuật khu vực (UC-ARE-04, TASK-042).
    /// </summary>
    [HttpPut("{idOrCode}")]
    [Authorize(Policy = "areas.update")]
    [ProducesResponseType(typeof(AreaDto), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    public async Task<IActionResult> Update(string idOrCode, [FromBody] UpdateAreaDto dto, CancellationToken ct)
    {
        var updated = await _areaService.UpdateAreaAsync(idOrCode, dto, ct);
        return Ok(updated);
    }

    /// <summary>
    /// Điều chuyển khu vực cha, kiểm tra chặn vòng lặp và cập nhật cascade đường dẫn phân khu con (UC-ARE-02, TASK-041).
    /// </summary>
    [HttpPut("{idOrCode}/parent")]
    [Authorize(Policy = "areas.update")]
    [ProducesResponseType(typeof(AreaDto), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    public async Task<IActionResult> ChangeParent(string idOrCode, [FromBody] ChangeAreaParentDto dto, CancellationToken ct)
    {
        var updated = await _areaService.ChangeParentAsync(idOrCode, dto, ct);
        return Ok(updated);
    }

    /// <summary>
    /// Tạm ngưng hoặc kích hoạt lại trạng thái khu vực (UC-ARE-13, TASK-042).
    /// </summary>
    [HttpPatch("{idOrCode}/status")]
    [Authorize(Policy = "areas.manage")]
    [ProducesResponseType(typeof(AreaDto), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    public async Task<IActionResult> ChangeStatus(string idOrCode, [FromBody] ChangeAreaStatusDto dto, CancellationToken ct)
    {
        var updated = await _areaService.ChangeStatusAsync(idOrCode, dto, ct);
        return Ok(updated);
    }

    /// <summary>
    /// Phân công nhân sự phụ trách khu vực (UC-ARE-13).
    /// </summary>
    [HttpPost("{idOrCode}/assignments")]
    [Authorize(Policy = "areas.manage")]
    [ProducesResponseType(typeof(AreaAssignmentSummaryDto), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> AssignStaff(string idOrCode, [FromBody] AssignStaffDto dto, CancellationToken ct)
    {
        var result = await _areaService.AssignStaffAsync(idOrCode, dto, ct);
        return Ok(result);
    }

    /// <summary>
    /// Kết thúc phân công nhân viên khỏi khu vực (UC-ARE-13).
    /// </summary>
    [HttpDelete("{idOrCode}/assignments/{assignmentIdOrStaffCode}")]
    [Authorize(Policy = "areas.manage")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> EndStaff(string idOrCode, string assignmentIdOrStaffCode, CancellationToken ct)
    {
        await _areaService.EndStaffAsync(idOrCode, assignmentIdOrStaffCode, ct);
        return NoContent();
    }

    /// <summary>
    /// Cập nhật danh mục dịch vụ được phép khai thác tại khu vực (UC-ARE-13).
    /// </summary>
    [HttpPut("{idOrCode}/services")]
    [Authorize(Policy = "areas.manage")]
    [ProducesResponseType(typeof(List<AreaServiceSummaryDto>), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> SetServices(string idOrCode, [FromBody] SetServicesDto dto, CancellationToken ct)
    {
        var result = await _areaService.SetServicesAsync(idOrCode, dto, ct);
        return Ok(result);
    }

    /// <summary>
    /// Danh sách bảng giá áp dụng tại khu vực (UC-ARE-13 tab Bảng giá).
    /// </summary>
    [HttpGet("{idOrCode}/price-lists")]
    [Authorize(Policy = "areas.view")]
    [ProducesResponseType(typeof(List<AreaPriceListDto>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetPriceLists(string idOrCode, CancellationToken ct)
    {
        var result = await _areaService.GetPriceListsAsync(idOrCode, ct);
        return Ok(result);
    }

    /// <summary>
    /// Danh sách hợp đồng và sản lượng tại khu vực (UC-ARE-13 tab Hợp đồng & Sản lượng).
    /// </summary>
    [HttpGet("{idOrCode}/contracts")]
    [Authorize(Policy = "areas.view")]
    [ProducesResponseType(typeof(AreaContractsDto), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetContracts(string idOrCode, CancellationToken ct)
    {
        var result = await _areaService.GetContractsAsync(idOrCode, ct);
        return Ok(result);
    }
}
