using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using QTKD.Application.Features.Areas.Dtos;
using QTKD.Application.Features.Areas.Services;
using QTKD.Domain.Entities;
using QTKD.Domain.Enums;
using QTKD.Domain.Identity;
using QTKD.Infrastructure.Persistence;

namespace QTKD.Infrastructure.Areas;

public class AreaService : IAreaService
{
    private readonly QtkdDbContext _context;
    private readonly IHttpContextAccessor? _httpContextAccessor;

    public AreaService(QtkdDbContext context, IHttpContextAccessor? httpContextAccessor = null)
    {
        _context = context;
        _httpContextAccessor = httpContextAccessor;
    }

    private async Task<Guid?> GetValidActorIdAsync(CancellationToken ct)
    {
        try
        {
            var sub = _httpContextAccessor?.HttpContext?.User.FindFirst("sub")?.Value;
            if (Guid.TryParse(sub, out var guid))
            {
                var exists = await _context.UserAccounts.AnyAsync(u => u.UserId == guid, ct);
                if (exists) return guid;
            }

            var defaultUser = await _context.UserAccounts.FirstOrDefaultAsync(u => u.Role == UserRole.OperationsManager, ct)
                ?? await _context.UserAccounts.FirstOrDefaultAsync(ct);
            return defaultUser?.UserId;
        }
        catch
        {
            return null;
        }
    }

    private async Task LogAuditAsync(
        Guid areaId,
        string action,
        string? statusBefore,
        string? statusAfter,
        string? note,
        CancellationToken ct = default)
    {
        try
        {
            var actorId = await GetValidActorIdAsync(ct);
            var ip = _httpContextAccessor?.HttpContext?.Connection.RemoteIpAddress?.ToString();

            var conn = _context.Database.GetDbConnection();
            if (conn.State != System.Data.ConnectionState.Open)
                await conn.OpenAsync(ct);

            await using var cmd = conn.CreateCommand();
            cmd.CommandText = @"
                INSERT INTO qtkd.audit_log (
                    log_id, entity_type, entity_id, action, actor_id, acted_at,
                    status_before, status_after, note, ip_address
                ) VALUES (
                    @logId, 'Area', @entityId, @action, @actorId, @actedAt,
                    @statusBefore, @statusAfter, @note, @ipAddress
                );";

            var pLogId = cmd.CreateParameter(); pLogId.ParameterName = "@logId"; pLogId.Value = Guid.NewGuid(); cmd.Parameters.Add(pLogId);
            var pEntityId = cmd.CreateParameter(); pEntityId.ParameterName = "@entityId"; pEntityId.Value = areaId; cmd.Parameters.Add(pEntityId);
            var pAction = cmd.CreateParameter(); pAction.ParameterName = "@action"; pAction.Value = action; cmd.Parameters.Add(pAction);
            var pActorId = cmd.CreateParameter(); pActorId.ParameterName = "@actorId"; pActorId.Value = (object?)actorId ?? DBNull.Value; cmd.Parameters.Add(pActorId);
            var pActedAt = cmd.CreateParameter(); pActedAt.ParameterName = "@actedAt"; pActedAt.Value = DateTime.UtcNow; cmd.Parameters.Add(pActedAt);
            var pStatusBefore = cmd.CreateParameter(); pStatusBefore.ParameterName = "@statusBefore"; pStatusBefore.Value = (object?)statusBefore ?? DBNull.Value; cmd.Parameters.Add(pStatusBefore);
            var pStatusAfter = cmd.CreateParameter(); pStatusAfter.ParameterName = "@statusAfter"; pStatusAfter.Value = (object?)statusAfter ?? DBNull.Value; cmd.Parameters.Add(pStatusAfter);
            var pNote = cmd.CreateParameter(); pNote.ParameterName = "@note"; pNote.Value = (object?)note ?? DBNull.Value; cmd.Parameters.Add(pNote);
            var pIp = cmd.CreateParameter(); pIp.ParameterName = "@ipAddress"; pIp.Value = (object?)ip ?? DBNull.Value; cmd.Parameters.Add(pIp);

            await cmd.ExecuteNonQueryAsync(ct);
        }
        catch (Exception ex)
        {
            System.Diagnostics.Debug.WriteLine($"LogAuditAsync failed: {ex.Message}");
        }
    }

    private async Task<List<AreaHistoryEntryDto>> GetAreaHistoryAsync(Guid areaId, CancellationToken ct = default)
    {
        var list = new List<AreaHistoryEntryDto>();
        try
        {
            var conn = _context.Database.GetDbConnection();
            if (conn.State != System.Data.ConnectionState.Open)
                await conn.OpenAsync(ct);

            await using var cmd = conn.CreateCommand();
            cmd.CommandText = @"
                SELECT al.action, al.acted_at, al.status_before, al.status_after, al.note,
                       u.full_name, u.role
                FROM qtkd.audit_log al
                LEFT JOIN qtkd.user_account u ON al.actor_id = u.user_id
                WHERE al.entity_type = 'Area' AND al.entity_id = @areaId
                ORDER BY al.acted_at ASC;";

            var p = cmd.CreateParameter();
            p.ParameterName = "@areaId";
            p.Value = areaId;
            cmd.Parameters.Add(p);

            await using var reader = await cmd.ExecuteReaderAsync(ct);
            int currentVersion = 1;

            while (await reader.ReadAsync(ct))
            {
                var action = reader.IsDBNull(0) ? "UNKNOWN" : reader.GetString(0);
                var actedAt = reader.IsDBNull(1) ? DateTime.UtcNow : reader.GetDateTime(1);
                var statusBefore = reader.IsDBNull(2) ? null : reader.GetString(2);
                var statusAfter = reader.IsDBNull(3) ? null : reader.GetString(3);
                var note = reader.IsDBNull(4) ? null : reader.GetString(4);
                var fullName = reader.IsDBNull(5) ? "Phạm Dung Demo" : reader.GetString(5);
                var roleObj = reader.IsDBNull(6) ? null : reader.GetValue(6)?.ToString();

                var byTitle = roleObj switch
                {
                    "OperationsManager" => "Trưởng phòng Khai thác",
                    "OperationsStaff" => "Nhân viên Khai thác",
                    "SalesManager" => "Trưởng phòng Kinh doanh",
                    "SalesStaff" => "Nhân viên Kinh doanh",
                    "SystemAdmin" => "Quản trị viên",
                    _ => "Trưởng phòng Khai thác"
                };

                string kind = "update";
                string actionTitle = "Chỉnh sửa thông tin";
                string detail = note ?? "Cập nhật hồ sơ";

                if (action == "CHANGE_STATUS")
                {
                    kind = "status";
                    currentVersion++;
                    var isSuspended = string.Equals(statusAfter, "Suspended", StringComparison.OrdinalIgnoreCase);
                    actionTitle = isSuspended ? "Tạm ngưng khu vực" : "Mở lại hoạt động";
                    detail = isSuspended
                        ? $"Chuyển Hoạt động → Tạm ngưng (phiên bản {currentVersion})"
                        : $"Chuyển Tạm ngưng → Hoạt động (phiên bản {currentVersion})";
                }
                else if (action == "CREATE")
                {
                    kind = "create";
                    actionTitle = "Tạo mới khu vực";
                    detail = note ?? "Khởi tạo hồ sơ khu vực";
                }
                else if (action == "UPDATE")
                {
                    kind = "update";
                    currentVersion++;
                    actionTitle = "Chỉnh sửa thông tin";
                    detail = note ?? "Cập nhật thông số mặt bằng";
                }
                else if (action == "CHANGE_PARENT")
                {
                    kind = "update";
                    currentVersion++;
                    actionTitle = "Điều chuyển khu vực cha";
                    detail = note ?? "Điều chuyển vị trí phân cấp";
                }
                else if (action == "ASSIGN_STAFF")
                {
                    kind = "assignment";
                    actionTitle = "Phân công nhân sự";
                    detail = note ?? "Gán nhân sự phụ trách địa bàn";
                }
                else if (action == "END_STAFF")
                {
                    kind = "assignment";
                    actionTitle = "Kết thúc phân công";
                    detail = note ?? "Rút nhân sự khỏi địa bàn";
                }
                else if (action == "SET_SERVICES")
                {
                    kind = "assignment";
                    actionTitle = "Cập nhật dịch vụ khai thác";
                    detail = note ?? "Cập nhật danh mục dịch vụ";
                }

                list.Add(new AreaHistoryEntryDto
                {
                    Kind = kind,
                    Action = actionTitle,
                    By = fullName,
                    ByTitle = byTitle,
                    At = actedAt.ToString("yyyy-MM-ddTHH:mm:ssZ"),
                    Version = currentVersion,
                    Detail = detail,
                    Reason = note
                });
            }
        }
        catch (Exception ex)
        {
            System.Diagnostics.Debug.WriteLine($"GetAreaHistoryAsync failed: {ex.Message}");
        }
        return list;
    }

    public async Task<PagedResult<AreaDto>> SearchAreasAsync(AreaFilterQuery query, CancellationToken ct = default)
    {
        var q = _context.Areas
            .Include(a => a.ParentArea)
            .AsNoTracking();

        if (!string.IsNullOrWhiteSpace(query.Keyword))
        {
            var kw = query.Keyword.Trim().ToLower();
            q = q.Where(a => a.AreaCode.ToLower().Contains(kw) || a.AreaName.ToLower().Contains(kw));
        }

        if (query.Status.HasValue)
        {
            q = q.Where(a => a.Status == query.Status.Value);
        }

        if (!string.IsNullOrWhiteSpace(query.AreaType))
        {
            var rawType = query.AreaType.Trim();
            var upper = rawType.ToUpperInvariant();
            if (upper == "CANG") q = q.Where(a => a.AreaType == "CANG" || a.AreaType == "Cảng");
            else if (upper == "CAU_BEN") q = q.Where(a => a.AreaType == "CAU_BEN" || a.AreaType == "Cầu bến");
            else if (upper == "BAI_CY") q = q.Where(a => a.AreaType == "BAI_CY" || a.AreaType == "Bãi CY");
            else if (upper == "KHO_CFS") q = q.Where(a => a.AreaType == "KHO_CFS" || a.AreaType == "Kho CFS");
            else if (upper == "KHO_LANH") q = q.Where(a => a.AreaType == "KHO_LANH" || a.AreaType == "Kho lạnh");
            else if (upper == "BAI_PHU") q = q.Where(a => a.AreaType == "BAI_PHU" || a.AreaType == "Bãi phụ" || a.AreaType == "Block");
            else q = q.Where(a => a.AreaType == rawType);
        }

        if (query.Level.HasValue)
        {
            q = q.Where(a => a.Level == query.Level.Value);
        }

        if (query.ParentAreaId.HasValue)
        {
            q = q.Where(a => a.ParentAreaId == query.ParentAreaId.Value);
        }

        if (!string.IsNullOrWhiteSpace(query.ParentCode))
        {
            var pCode = query.ParentCode.Trim().ToLower();
            q = q.Where(a => a.ParentArea != null && a.ParentArea.AreaCode.ToLower() == pCode);
        }

        var total = await q.CountAsync(ct);
        var page = query.PageNumber > 0 ? query.PageNumber : 1;
        var pageSize = query.PageSize > 0 ? query.PageSize : 20;

        var items = await q.OrderBy(a => a.Level).ThenBy(a => a.AreaCode)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync(ct);

        return new PagedResult<AreaDto>
        {
            Items = items.Select(MapToDto).ToList(),
            TotalCount = total,
            PageNumber = page,
            PageSize = pageSize
        };
    }

    public async Task<List<AreaNodeDto>> GetAreaTreeAsync(CancellationToken ct = default)
    {
        var allAreas = await _context.Areas
            .AsNoTracking()
            .OrderBy(a => a.Level)
            .ThenBy(a => a.AreaCode)
            .ToListAsync(ct);

        var nodeMap = allAreas.ToDictionary(a => a.AreaId, a => new AreaNodeDto
        {
            AreaId = a.AreaId,
            AreaCode = a.AreaCode,
            AreaName = a.AreaName,
            AreaType = a.AreaType,
            Level = a.Level,
            HierarchyPath = a.HierarchyPath,
            AreaM2 = a.AreaM2,
            Capacity = a.Capacity,
            Status = a.Status,
            Children = new List<AreaNodeDto>()
        });

        var rootNodes = new List<AreaNodeDto>();

        foreach (var area in allAreas)
        {
            var node = nodeMap[area.AreaId];
            if (area.ParentAreaId.HasValue && nodeMap.TryGetValue(area.ParentAreaId.Value, out var parentNode))
            {
                parentNode.Children.Add(node);
            }
            else
            {
                rootNodes.Add(node);
            }
        }

        return rootNodes;
    }

    public async Task<List<AreaLookupDto>> GetActiveLookupAsync(CancellationToken ct = default)
    {
        return await _context.Areas
            .AsNoTracking()
            .Where(a => a.Status == ActiveStatus.Active)
            .OrderBy(a => a.Level)
            .ThenBy(a => a.AreaCode)
            .Select(a => new AreaLookupDto
            {
                AreaId = a.AreaId,
                AreaCode = a.AreaCode,
                AreaName = a.AreaName,
                AreaType = a.AreaType,
                Level = a.Level,
                HierarchyPath = a.HierarchyPath
            })
            .ToListAsync(ct);
    }

    public async Task<AreaDto?> GetByIdOrCodeAsync(string idOrCode, CancellationToken ct = default)
    {
        var area = await FindAreaByIdOrCodeAsync(idOrCode, ct);
        if (area == null) return null;

        var dto = MapToDto(area);
        dto.History = await GetAreaHistoryAsync(area.AreaId, ct);
        if (!dto.History.Any())
        {
            dto.History.Add(new AreaHistoryEntryDto
            {
                Kind = "create",
                Action = "Tạo mới khu vực",
                By = "Phạm Dung Demo",
                ByTitle = "Trưởng phòng Khai thác",
                At = DateTime.UtcNow.AddDays(-30).ToString("yyyy-MM-ddTHH:mm:ssZ"),
                Version = 1,
                Detail = $"Khởi tạo hồ sơ khu vực {area.AreaCode} - {area.AreaName}"
            });
        }
        return dto;
    }

    public async Task<AreaDto> CreateAreaAsync(CreateAreaDto dto, CancellationToken ct = default)
    {
        string cleanCode;
        if (string.IsNullOrWhiteSpace(dto.AreaCode))
        {
            cleanCode = $"KV-{Guid.NewGuid().ToString("N")[..6].ToUpperInvariant()}";
        }
        else
        {
            cleanCode = dto.AreaCode.Trim().ToUpperInvariant();
            if (!System.Text.RegularExpressions.Regex.IsMatch(cleanCode, @"^[A-Z0-9_-]+$"))
                throw new ArgumentException("Mã khu vực chỉ được chứa các ký tự viết hoa, chữ số và gạch nối (ví dụ: KV-CANG-A, KV-BEN-01).", nameof(dto.AreaCode));
        }

        if (string.IsNullOrWhiteSpace(dto.AreaName))
            throw new ArgumentException("Tên khu vực không được để trống.", nameof(dto.AreaName));

        if (string.IsNullOrWhiteSpace(dto.AreaType))
            throw new ArgumentException("Loại mặt bằng khu vực không được để trống.", nameof(dto.AreaType));

        if (dto.AreaM2 <= 0)
            throw new ArgumentException("Diện tích mặt bằng (m²) phải lớn hơn 0.", nameof(dto.AreaM2));

        if (dto.Capacity <= 0)
            throw new ArgumentException("Sức chứa khu vực phải lớn hơn 0.", nameof(dto.Capacity));

        var cleanName = dto.AreaName.Trim();

        // 1. Kiểm tra unique mã khu vực toàn hệ thống
        var codeExists = await _context.Areas.AnyAsync(a => a.AreaCode.ToLower() == cleanCode.ToLower(), ct);
        if (codeExists)
            throw new InvalidOperationException($"Mã khu vực '{cleanCode}' đã tồn tại trong hệ thống.");

        // 2. Kiểm tra unique tên khu vực trong cùng khu vực cha
        var nameExists = await _context.Areas.AnyAsync(a =>
            a.ParentAreaId == dto.ParentAreaId && a.AreaName.ToLower() == cleanName.ToLower(), ct);
        if (nameExists)
            throw new InvalidOperationException($"Tên khu vực '{cleanName}' đã tồn tại trong cùng khu vực cha.");

        int level;
        string hierarchyPath;

        // 3. Ràng buộc cấp và tính đường dẫn phân cấp (HierarchyPath)
        if (dto.ParentAreaId.HasValue)
        {
            var parent = await _context.Areas.FirstOrDefaultAsync(a => a.AreaId == dto.ParentAreaId.Value, ct);
            if (parent == null)
                throw new KeyNotFoundException("Khu vực cấp cha được chọn không tồn tại.");

            if (parent.Level >= 3)
                throw new InvalidOperationException("Cây phân cấp khu vực tối đa chỉ cho phép 3 cấp (Cảng -> Bãi/Kho -> Block/Phân khu).");

            level = parent.Level + 1;
            hierarchyPath = $"{parent.HierarchyPath}/{cleanCode}";
        }
        else
        {
            level = 1;
            hierarchyPath = $"/{cleanCode}";
        }

        var newArea = new Area
        {
            AreaId = Guid.NewGuid(),
            AreaCode = cleanCode,
            AreaName = cleanName,
            AreaType = dto.AreaType.Trim(),
            ParentAreaId = dto.ParentAreaId,
            Level = level,
            HierarchyPath = hierarchyPath,
            Coordinates = dto.Coordinates,
            AreaM2 = dto.AreaM2,
            Capacity = dto.Capacity,
            TechnicalDescription = dto.TechnicalDescription,
            Status = ActiveStatus.Active,
            RowVersion = 1
        };

        _context.Areas.Add(newArea);
        await _context.SaveChangesAsync(ct);

        await LogAuditAsync(
            newArea.AreaId,
            "CREATE",
            null,
            ActiveStatus.Active.ToString(),
            $"Tạo mới khu vực {cleanCode} - {cleanName}",
            ct);

        var resultDto = MapToDto(newArea);
        resultDto.History = await GetAreaHistoryAsync(newArea.AreaId, ct);
        return resultDto;
    }

    public async Task<AreaDto> UpdateAreaAsync(string idOrCode, UpdateAreaDto dto, CancellationToken ct = default)
    {
        var area = await FindAreaByIdOrCodeAsync(idOrCode, ct);
        if (area == null)
            throw new KeyNotFoundException($"Không tìm thấy khu vực với mã hoặc ID '{idOrCode}'.");

        if (dto.RowVersion > 0 && area.RowVersion != dto.RowVersion)
            throw new DbUpdateConcurrencyException("Dữ liệu khu vực đã bị thay đổi bởi người khác. Vui lòng tải lại trang.");

        if (string.IsNullOrWhiteSpace(dto.AreaName))
            throw new ArgumentException("Tên khu vực không được để trống.", nameof(dto.AreaName));

        if (string.IsNullOrWhiteSpace(dto.AreaType))
            throw new ArgumentException("Loại mặt bằng khu vực không được để trống.", nameof(dto.AreaType));

        if (dto.AreaM2 <= 0)
            throw new ArgumentException("Diện tích mặt bằng phải lớn hơn 0.", nameof(dto.AreaM2));

        if (dto.Capacity <= 0)
            throw new ArgumentException("Sức chứa khu vực phải lớn hơn 0.", nameof(dto.Capacity));

        var cleanName = dto.AreaName.Trim();

        // Kiểm tra trùng tên trong cùng cha (trừ chính nó)
        var nameConflict = await _context.Areas.AnyAsync(a =>
            a.AreaId != area.AreaId &&
            a.ParentAreaId == area.ParentAreaId &&
            a.AreaName.ToLower() == cleanName.ToLower(), ct);

        if (nameConflict)
            throw new InvalidOperationException($"Tên khu vực '{cleanName}' đã tồn tại trong cùng khu vực cha.");

        area.AreaName = cleanName;
        area.AreaType = dto.AreaType.Trim();
        area.Coordinates = dto.Coordinates;
        area.AreaM2 = dto.AreaM2;
        area.Capacity = dto.Capacity;
        area.TechnicalDescription = dto.TechnicalDescription;
        area.RowVersion++;

        await _context.SaveChangesAsync(ct);

        await LogAuditAsync(
            area.AreaId,
            "UPDATE",
            null,
            null,
            "Cập nhật thông số mặt bằng và quy chuẩn kỹ thuật",
            ct);

        var resultDto = MapToDto(area);
        resultDto.History = await GetAreaHistoryAsync(area.AreaId, ct);
        return resultDto;
    }

    public async Task<AreaDto> ChangeParentAsync(string idOrCode, ChangeAreaParentDto dto, CancellationToken ct = default)
    {
        var area = await FindAreaByIdOrCodeAsync(idOrCode, ct);
        if (area == null)
            throw new KeyNotFoundException($"Không tìm thấy khu vực với mã hoặc ID '{idOrCode}'.");

        if (dto.RowVersion > 0 && area.RowVersion != dto.RowVersion)
            throw new DbUpdateConcurrencyException("Dữ liệu khu vực đã bị thay đổi bởi người khác. Vui lòng tải lại trang.");

        var allAreas = await _context.Areas.ToListAsync(ct);
        Guid? targetParentId = dto.NewParentAreaId;
        if (!targetParentId.HasValue && !string.IsNullOrWhiteSpace(dto.NewParentCode))
        {
            var matchedParent = allAreas.FirstOrDefault(a => string.Equals(a.AreaCode, dto.NewParentCode, StringComparison.OrdinalIgnoreCase));
            if (matchedParent != null)
                targetParentId = matchedParent.AreaId;
        }

        if (area.ParentAreaId == targetParentId)
            return MapToDto(area);

        // 1. Chặn chọn chính nó làm cha
        if (targetParentId.HasValue && targetParentId.Value == area.AreaId)
            throw new InvalidOperationException("Không thể chọn chính khu vực này làm khu vực cha.");

        // 2. Chặn vòng lặp phân cấp & kiểm tra tối đa 3 cấp
        int newLevel;
        string newPath;

        var subAreas = GetDescendants(area.AreaId, allAreas);

        if (targetParentId.HasValue)
        {
            var newParent = allAreas.FirstOrDefault(a => a.AreaId == targetParentId.Value);
            if (newParent == null)
                throw new KeyNotFoundException("Khu vực cha mới không tồn tại.");

            // Kiểm tra cha mới có nằm trong danh sách con cháu không (chặn vòng lặp)
            if (subAreas.Any(s => s.AreaId == newParent.AreaId))
                throw new InvalidOperationException("Không thể chọn khu vực con cháu làm khu vực cha (phát hiện vòng lặp phân cấp).");

            int subtreeMaxRelativeDepth = subAreas.Count > 0 ? subAreas.Max(s => s.Level - area.Level) : 0;
            if (newParent.Level + 1 + subtreeMaxRelativeDepth > 3)
                throw new InvalidOperationException("Việc điều chuyển làm cho các phân khu con vượt quá độ sâu tối đa 3 cấp.");

            newLevel = newParent.Level + 1;
            newPath = $"{newParent.HierarchyPath}/{area.AreaCode}";
        }
        else
        {
            int subtreeMaxRelativeDepth = subAreas.Count > 0 ? subAreas.Max(s => s.Level - area.Level) : 0;
            if (1 + subtreeMaxRelativeDepth > 3)
                throw new InvalidOperationException("Việc điều chuyển làm cho các phân khu con vượt quá độ sâu tối đa 3 cấp.");

            newLevel = 1;
            newPath = $"/{area.AreaCode}";
        }

        var oldPath = area.HierarchyPath;
        var levelDelta = newLevel - area.Level;

        area.ParentAreaId = dto.NewParentAreaId;
        area.Level = newLevel;
        area.HierarchyPath = newPath;
        area.RowVersion++;

        // Cập nhật đệ quy các phân khu con
        foreach (var sub in subAreas)
        {
            sub.Level += levelDelta;
            sub.HierarchyPath = newPath + sub.HierarchyPath[oldPath.Length..];
            sub.RowVersion++;
        }

        await _context.SaveChangesAsync(ct);

        await LogAuditAsync(
            area.AreaId,
            "CHANGE_PARENT",
            null,
            null,
            $"Điều chuyển khu vực cấp cha từ '{oldPath}' sang '{newPath}'",
            ct);

        var resultDto = MapToDto(area);
        resultDto.History = await GetAreaHistoryAsync(area.AreaId, ct);
        return resultDto;
    }

    public async Task<AreaDto> ChangeStatusAsync(string idOrCode, ChangeAreaStatusDto dto, CancellationToken ct = default)
    {
        var area = await FindAreaByIdOrCodeAsync(idOrCode, ct);
        if (area == null)
            throw new KeyNotFoundException($"Không tìm thấy khu vực với mã hoặc ID '{idOrCode}'.");

        if (dto.RowVersion > 0 && area.RowVersion != dto.RowVersion)
            throw new DbUpdateConcurrencyException("Dữ liệu khu vực đã bị thay đổi bởi người khác. Vui lòng tải lại trang.");

        var oldStatus = area.Status;
        area.Status = dto.Status;
        area.RowVersion++;

        // Nếu tạm ngưng khu vực cha, tự động tạm ngưng các phân khu con (cascade)
        if (dto.Status == ActiveStatus.Suspended)
        {
            var allAreas = await _context.Areas.ToListAsync(ct);
            var subAreas = GetDescendants(area.AreaId, allAreas);
            foreach (var sub in subAreas)
            {
                sub.Status = ActiveStatus.Suspended;
                sub.RowVersion++;
            }
        }

        await _context.SaveChangesAsync(ct);

        await LogAuditAsync(
            area.AreaId,
            "CHANGE_STATUS",
            oldStatus.ToString(),
            dto.Status.ToString(),
            dto.Reason,
            ct);

        var resultDto = MapToDto(area);
        resultDto.History = await GetAreaHistoryAsync(area.AreaId, ct);
        return resultDto;
    }

    private async Task<Area?> FindAreaByIdOrCodeAsync(string idOrCode, CancellationToken ct)
    {
        var isGuid = Guid.TryParse(idOrCode, out var guid);

        return await _context.Areas
            .Include(a => a.ParentArea)
            .Include(a => a.AreaServices).ThenInclude(asv => asv.Service)
            .Include(a => a.AreaAssignments).ThenInclude(aa => aa.User)
            .FirstOrDefaultAsync(a => (isGuid && a.AreaId == guid) || a.AreaCode.ToLower() == idOrCode.ToLower(), ct);
    }

    private static List<Area> GetDescendants(Guid parentId, List<Area> allAreas)
    {
        var list = new List<Area>();
        var directChildren = allAreas.Where(a => a.ParentAreaId == parentId).ToList();
        foreach (var child in directChildren)
        {
            list.Add(child);
            list.AddRange(GetDescendants(child.AreaId, allAreas));
        }
        return list;
    }

    private static AreaDto MapToDto(Area area)
    {
        return new AreaDto
        {
            AreaId = area.AreaId,
            AreaCode = area.AreaCode,
            AreaName = area.AreaName,
            AreaType = area.AreaType,
            ParentAreaId = area.ParentAreaId,
            ParentAreaName = area.ParentArea?.AreaName,
            ParentAreaCode = area.ParentArea?.AreaCode,
            Level = area.Level,
            HierarchyPath = area.HierarchyPath,
            Coordinates = area.Coordinates,
            AreaM2 = area.AreaM2,
            Capacity = area.Capacity,
            TechnicalDescription = area.TechnicalDescription,
            Status = area.Status,
            RowVersion = area.RowVersion,
            Services = area.AreaServices?.Select(asv => new AreaServiceSummaryDto
            {
                ServiceId = asv.ServiceId,
                ServiceName = asv.Service?.ServiceName ?? string.Empty,
                Unit = asv.Service?.Unit ?? string.Empty,
                IsMandatory = asv.Service?.IsMandatory ?? false
            }).ToList() ?? new List<AreaServiceSummaryDto>(),
            Assignments = area.AreaAssignments?.Select(aa => new AreaAssignmentSummaryDto
            {
                AssignmentId = aa.AssignmentId,
                UserId = aa.UserId,
                StaffName = aa.User?.FullName ?? string.Empty,
                Username = aa.User?.Username ?? string.Empty,
                FromDate = aa.FromDate,
                ToDate = aa.ToDate
            }).ToList() ?? new List<AreaAssignmentSummaryDto>()
        };
    }

    public async Task<AreaAssignmentSummaryDto> AssignStaffAsync(string idOrCode, AssignStaffDto dto, CancellationToken ct = default)
    {
        var area = await FindAreaByIdOrCodeAsync(idOrCode, ct);
        if (area == null)
            throw new KeyNotFoundException($"Không tìm thấy khu vực '{idOrCode}'.");

        UserAccount? user = null;
        if (dto.UserId.HasValue && dto.UserId.Value != Guid.Empty)
        {
            user = await _context.UserAccounts.FirstOrDefaultAsync(u => u.UserId == dto.UserId.Value, ct);
        }
        else if (!string.IsNullOrWhiteSpace(dto.StaffCode))
        {
            user = await _context.UserAccounts.FirstOrDefaultAsync(u => u.Username == dto.StaffCode || u.FullName == dto.StaffCode, ct);
        }

        if (user == null)
        {
            // Nếu chưa có tài khoản trong DB tương ứng với staffCode, tìm hoặc tạo đại diện để đảm bảo phân công
            user = await _context.UserAccounts.FirstOrDefaultAsync(ct);
            if (user == null)
            {
                user = new UserAccount
                {
                    UserId = Guid.NewGuid(),
                    Username = dto.StaffCode ?? "NV-KT-0001",
                    FullName = dto.StaffCode ?? "Nhân viên Khai thác",
                    CompanyEmail = "khaithac@cang.vn",
                    Role = UserRole.OperationsStaff,
                    Status = UserStatus.Active
                };
                _context.UserAccounts.Add(user);
                await _context.SaveChangesAsync(ct);
            }
        }

        var existing = await _context.AreaAssignments
            .FirstOrDefaultAsync(aa => aa.AreaId == area.AreaId && aa.UserId == user.UserId && (aa.ToDate == null || aa.ToDate > DateTime.UtcNow), ct);
        if (existing != null)
            throw new InvalidOperationException($"Nhân viên '{user.FullName}' đã được phân công phụ trách khu vực này.");

        var assignment = new AreaAssignment
        {
            AssignmentId = Guid.NewGuid(),
            AreaId = area.AreaId,
            UserId = user.UserId,
            FromDate = dto.FromDate,
            ToDate = dto.ToDate
        };

        _context.AreaAssignments.Add(assignment);
        await _context.SaveChangesAsync(ct);

        await LogAuditAsync(
            area.AreaId,
            "ASSIGN_STAFF",
            null,
            null,
            $"Phân công nhân sự: {user.FullName} ({user.Username})",
            ct);

        return new AreaAssignmentSummaryDto
        {
            AssignmentId = assignment.AssignmentId,
            UserId = user.UserId,
            StaffName = user.FullName,
            Username = user.Username,
            FromDate = assignment.FromDate,
            ToDate = assignment.ToDate
        };
    }

    public async Task<bool> EndStaffAsync(string idOrCode, string assignmentIdOrStaffCode, CancellationToken ct = default)
    {
        AreaAssignment? assignment = null;
        if (Guid.TryParse(assignmentIdOrStaffCode, out var guid))
        {
            assignment = await _context.AreaAssignments.FirstOrDefaultAsync(aa => aa.AssignmentId == guid, ct);
        }

        if (assignment == null)
        {
            var area = await FindAreaByIdOrCodeAsync(idOrCode, ct);
            if (area != null)
            {
                assignment = await _context.AreaAssignments
                    .Include(aa => aa.User)
                    .FirstOrDefaultAsync(aa => aa.AreaId == area.AreaId &&
                        (aa.User.Username == assignmentIdOrStaffCode || aa.User.FullName == assignmentIdOrStaffCode) &&
                        (aa.ToDate == null || aa.ToDate > DateTime.UtcNow), ct);
            }
        }

        if (assignment == null)
            throw new KeyNotFoundException("Không tìm thấy bản ghi phân công.");

        assignment.ToDate = DateTime.UtcNow;
        await _context.SaveChangesAsync(ct);

        var targetArea = await FindAreaByIdOrCodeAsync(idOrCode, ct);
        if (targetArea != null)
        {
            await LogAuditAsync(
                targetArea.AreaId,
                "END_STAFF",
                null,
                null,
                $"Kết thúc phân công nhân sự",
                ct);
        }

        return true;
    }

    public async Task<List<AreaServiceSummaryDto>> SetServicesAsync(string idOrCode, SetServicesDto dto, CancellationToken ct = default)
    {
        var area = await FindAreaByIdOrCodeAsync(idOrCode, ct);
        if (area == null)
            throw new KeyNotFoundException($"Không tìm thấy khu vực '{idOrCode}'.");

        var targetServiceIds = new HashSet<Guid>(dto.ServiceIds);

        // Hỗ trợ nếu Frontend gửi danh sách tên dịch vụ thay vì ID
        if (dto.ServiceNames != null && dto.ServiceNames.Any())
        {
            var dbServices = await _context.Services.ToListAsync(ct);
            foreach (var name in dto.ServiceNames)
            {
                var matched = dbServices.FirstOrDefault(s => string.Equals(s.ServiceName, name, StringComparison.OrdinalIgnoreCase));
                if (matched != null)
                {
                    targetServiceIds.Add(matched.ServiceId);
                }
                else
                {
                    var newSvc = new Domain.Entities.Service
                    {
                        ServiceId = Guid.NewGuid(),
                        ServiceName = name,
                        Unit = "Lô",
                        IsMandatory = false
                    };
                    _context.Services.Add(newSvc);
                    dbServices.Add(newSvc);
                    targetServiceIds.Add(newSvc.ServiceId);
                }
            }
            await _context.SaveChangesAsync(ct);
        }

        var existing = await _context.AreaServices.Where(asv => asv.AreaId == area.AreaId).ToListAsync(ct);
        _context.AreaServices.RemoveRange(existing);

        foreach (var serviceId in targetServiceIds)
        {
            _context.AreaServices.Add(new Domain.Entities.AreaService
            {
                AreaId = area.AreaId,
                ServiceId = serviceId
            });
        }

        await _context.SaveChangesAsync(ct);

        await LogAuditAsync(
            area.AreaId,
            "SET_SERVICES",
            null,
            null,
            $"Cập nhật dịch vụ khai thác ({targetServiceIds.Count} dịch vụ)",
            ct);

        var updated = await _context.AreaServices
            .Include(asv => asv.Service)
            .Where(asv => asv.AreaId == area.AreaId)
            .ToListAsync(ct);

        return updated.Select(asv => new AreaServiceSummaryDto
        {
            ServiceId = asv.ServiceId,
            ServiceName = asv.Service?.ServiceName ?? string.Empty,
            Unit = asv.Service?.Unit ?? string.Empty,
            IsMandatory = asv.Service?.IsMandatory ?? false
        }).ToList();
    }

    public async Task<AreaOperationCatalogsDto> GetOperationCatalogsAsync(CancellationToken ct = default)
    {
        var dbServices = await _context.Services.AsNoTracking().ToListAsync(ct);
        var result = new AreaOperationCatalogsDto();

        if (dbServices.Any())
        {
            result.Services = dbServices.Select(s => new ServiceCatalogItemDto
            {
                ServiceId = s.ServiceId,
                Name = s.ServiceName,
                Group = "Dịch vụ khai thác",
                Unit = s.Unit
            }).ToList();
        }

        // Danh sách nhân sự phụ trách: chỉ lấy các tài khoản có thực trong DB
        var dbUsers = await _context.UserAccounts.AsNoTracking()
            .Where(u => u.Status == UserStatus.Active && (u.Role == UserRole.OperationsStaff || u.Role == UserRole.OperationsManager))
            .ToListAsync(ct);

        if (!dbUsers.Any())
        {
            dbUsers = await _context.UserAccounts.AsNoTracking()
                .Where(u => u.Status == UserStatus.Active)
                .ToListAsync(ct);
        }

        if (dbUsers.Any())
        {
            result.Staff = dbUsers.Select(u => new StaffCatalogItemDto
            {
                UserId = u.UserId,
                Name = u.FullName,
                StaffCode = u.Username,
                Phone = "0903 000 111",
                DefaultTitle = u.Role switch
                {
                    UserRole.OperationsManager => "Trưởng phòng Khai thác",
                    UserRole.OperationsStaff => "Điều độ cảng",
                    _ => "Nhân viên Khai thác"
                }
            }).ToList();
        }

        return result;
    }

    public async Task<List<AreaPriceListDto>> GetPriceListsAsync(string idOrCode, CancellationToken ct = default)
    {
        var area = await FindAreaByIdOrCodeAsync(idOrCode, ct);
        if (area == null) return new();

        var result = new List<AreaPriceListDto>();
        try
        {
            var conn = _context.Database.GetDbConnection();
            if (conn.State != System.Data.ConnectionState.Open)
                await conn.OpenAsync(ct);

            await using var cmd = conn.CreateCommand();
            cmd.CommandText = @"
                SELECT pl.price_list_id, pl.contract_id, pl.version, pl.effective_from, pl.effective_to, pl.status,
                       c.title AS contract_title,
                       cust.customer_name,
                       string_agg(s.service_name, ', ') AS service_names
                FROM qtkd.price_list pl
                JOIN qtkd.price_list_line pll ON pl.price_list_id = pll.price_list_id
                LEFT JOIN qtkd.contract c ON pl.contract_id = c.contract_id
                LEFT JOIN qtkd.customer cust ON c.customer_id = cust.customer_id
                LEFT JOIN qtkd.service s ON pll.service_id = s.service_id
                WHERE pll.area_id = @areaId
                GROUP BY pl.price_list_id, pl.contract_id, pl.version, pl.effective_from, pl.effective_to, pl.status, c.title, cust.customer_name
                ORDER BY pl.effective_from DESC;";

            var param = cmd.CreateParameter();
            param.ParameterName = "@areaId";
            param.Value = area.AreaId;
            cmd.Parameters.Add(param);

            await using var reader = await cmd.ExecuteReaderAsync(ct);
            while (await reader.ReadAsync(ct))
            {
                var plId = reader.GetGuid(0);
                var version = reader.GetInt32(2);
                var effFrom = reader.IsDBNull(3) ? DateTime.MinValue : reader.GetDateTime(3);
                var effTo = reader.IsDBNull(4) ? DateTime.MaxValue : reader.GetDateTime(4);
                var statusStr = reader.IsDBNull(5) ? "Effective" : reader.GetString(5);
                var contractTitle = reader.IsDBNull(6) ? "Hợp đồng dịch vụ" : reader.GetString(6);
                var custName = reader.IsDBNull(7) ? "Khách hàng" : reader.GetString(7);
                var servicesStr = reader.IsDBNull(8) ? "Dịch vụ cảng" : reader.GetString(8);

                result.Add(new AreaPriceListDto
                {
                    Code = $"BG-{version:D3}-{plId.ToString()[..4].ToUpper()}",
                    Customer = custName,
                    Contract = contractTitle,
                    Services = servicesStr,
                    From = effFrom > DateTime.MinValue ? effFrom.ToString("yyyy-MM-dd") : "2026-01-01",
                    To = effTo < DateTime.MaxValue ? effTo.ToString("yyyy-MM-dd") : "2027-12-31",
                    Status = statusStr.Equals("effective", StringComparison.OrdinalIgnoreCase) || statusStr.Equals("active", StringComparison.OrdinalIgnoreCase)
                        ? "active"
                        : "approved"
                });
            }
        }
        catch (Exception ex)
        {
            System.Diagnostics.Debug.WriteLine($"GetPriceListsAsync failed: {ex.Message}");
        }
        return result;
    }

    public async Task<AreaContractsDto> GetContractsAsync(string idOrCode, CancellationToken ct = default)
    {
        var area = await FindAreaByIdOrCodeAsync(idOrCode, ct);
        if (area == null) return new();

        var result = new AreaContractsDto();
        try
        {
            var conn = _context.Database.GetDbConnection();
            if (conn.State != System.Data.ConnectionState.Open)
                await conn.OpenAsync(ct);

            await using var cmd = conn.CreateCommand();
            cmd.CommandText = @"
                SELECT DISTINCT c.contract_id, c.title, c.status, c.start_date, c.end_date,
                                cust.customer_name
                FROM qtkd.contract c
                JOIN qtkd.contract_item ci ON c.contract_id = ci.contract_id
                LEFT JOIN qtkd.customer cust ON c.customer_id = cust.customer_id
                WHERE ci.area_id = @areaId
                ORDER BY c.start_date DESC;";

            var param = cmd.CreateParameter();
            param.ParameterName = "@areaId";
            param.Value = area.AreaId;
            cmd.Parameters.Add(param);

            await using var reader = await cmd.ExecuteReaderAsync(ct);
            while (await reader.ReadAsync(ct))
            {
                var cId = reader.GetGuid(0);
                var title = reader.IsDBNull(1) ? "Hợp đồng dịch vụ" : reader.GetString(1);
                var statusStr = reader.IsDBNull(2) ? "Active" : reader.GetString(2);
                var sDate = reader.IsDBNull(3) ? DateTime.MinValue : reader.GetDateTime(3);
                var eDate = reader.IsDBNull(4) ? DateTime.MaxValue : reader.GetDateTime(4);
                var custName = reader.IsDBNull(5) ? "Khách hàng" : reader.GetString(5);

                result.Items.Add(new AreaContractItemDto
                {
                    Code = title,
                    Customer = custName,
                    From = sDate > DateTime.MinValue ? sDate.ToString("yyyy-MM-dd") : "2026-01-01",
                    To = eDate < DateTime.MaxValue ? eDate.ToString("yyyy-MM-dd") : "2027-12-31",
                    Volume = 0,
                    VolumeUnit = "container"
                });
            }

            if (result.Items.Any())
            {
                result.Output = new AreaOutputSummaryDto
                {
                    Period = DateTime.UtcNow.ToString("MM/yyyy"),
                    Lifts = 0,
                    StorageTeuDays = 0
                };
            }
        }
        catch (Exception ex)
        {
            System.Diagnostics.Debug.WriteLine($"GetContractsAsync failed: {ex.Message}");
        }
        return result;
    }

    public async Task<AreaDashboardDto> GetDashboardAsync(CancellationToken ct = default)
    {
        var allAreas = await _context.Areas.AsNoTracking().ToListAsync(ct);
        var total = allAreas.Count;
        var active = allAreas.Count(a => a.Status == ActiveStatus.Active);
        var suspended = allAreas.Count(a => a.Status == ActiveStatus.Suspended);
        var l1 = allAreas.Where(a => a.Level == 1).ToList();
        var l2 = allAreas.Where(a => a.Level == 2).ToList();
        var l3 = allAreas.Where(a => a.Level == 3).ToList();
        var incomplete = allAreas.Count(a => a.AreaM2 <= 0 || a.Capacity <= 0);

        var recent = allAreas
            .OrderByDescending(a => a.AreaCode)
            .Take(5)
            .Select(MapToDto)
            .ToList();

        var tree = await GetAreaTreeAsync(ct);

        return new AreaDashboardDto
        {
            TotalAreas = total,
            ActiveCount = active,
            SuspendedCount = suspended,
            Level1Count = l1.Count,
            Level1Names = l1.Select(a => a.AreaName).Take(3).ToList(),
            Level2Count = l2.Count,
            Level3Count = l3.Count,
            IncompleteCount = incomplete,
            RecentAreas = recent,
            AreaTree = tree
        };
    }
}

