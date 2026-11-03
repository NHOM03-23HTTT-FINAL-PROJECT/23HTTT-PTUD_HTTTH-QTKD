namespace QTKD.Application.Features.WorkflowConfigs;

// SYS-CTR-10 / US-CTR-29.
// Kiểu dữ liệu khớp frontend/src/features/contracts/types/workflowConfig.ts,
// riêng người tham gia dùng user_id và phạm vi dùng mã phòng ban.

#region Cấu hình

/// <summary>
/// Một giai đoạn. Với "signing": Participants = người ký đại diện công ty,
/// Backups = người được ủy quyền ký, Notify = người theo dõi ký.
/// </summary>
public sealed record WorkflowStage(
    string Key,
    bool Enabled,
    string Role,
    string Mode,
    IReadOnlyList<Guid> Participants,
    IReadOnlyList<Guid> Backups,
    IReadOnlyList<Guid> Notify,
    string? Condition = null,
    string? ConfirmDepartment = null);

/// <summary>Nội dung người quản trị nhập trên biểu mẫu.</summary>
public sealed record WorkflowDraft(
    string Name,
    string DocType,
    string Scope,
    IReadOnlyList<WorkflowStage> Stages);

/// <summary>Một phiên bản trong lịch sử (A5).</summary>
public sealed record WorkflowVersion(
    int Version,
    DateTime ActivatedAt,
    string ActivatedByName,
    string Summary,
    IReadOnlyList<WorkflowStage> Stages);

/// <summary>Cấu hình: thông tin của phiên bản đang áp dụng kèm toàn bộ lịch sử.</summary>
public sealed record WorkflowConfig(
    string Code,
    string Name,
    string DocType,
    string Scope,
    string ScopeName,
    int Version,
    DateTime ActivatedAt,
    string ActivatedByName,
    IReadOnlyList<WorkflowStage> Stages,
    IReadOnlyList<WorkflowVersion> History);

/// <summary>Một dòng của danh sách: loại hồ sơ + phạm vi; Config = null khi chưa cấu hình.</summary>
public sealed record WorkflowConfigRow(string DocType, string Scope, string ScopeName, WorkflowConfig? Config);

#endregion

#region Danh mục để chọn

public sealed record WorkflowPerson(
    Guid Id,
    string Name,
    string Title,
    string DepartmentCode,
    string Department,
    bool Active,
    bool CanSign);

public sealed record WorkflowDepartment(string Code, string Name);

/// <summary>
/// People: người có thể chọn. Scopes: phòng ban được lập hợp đồng.
/// Departments: phòng ban có thể xác nhận phụ lục.
/// </summary>
public sealed record WorkflowCatalog(
    IReadOnlyList<WorkflowPerson> People,
    IReadOnlyList<WorkflowDepartment> Scopes,
    IReadOnlyList<WorkflowDepartment> Departments);

#endregion

#region Request / response

public sealed record CreateWorkflowRequest(WorkflowDraft Draft, bool ReplaceExisting = false);

public sealed record UpdateWorkflowRequest(int BaseVersion, WorkflowDraft Draft);

public sealed record CheckWorkflowRequest(WorkflowDraft Draft, string? Code = null);

public sealed record CheckWorkflowResult(bool Valid, WorkflowErrors? Errors, bool DuplicateScope);

public sealed record ActivateWorkflowResult(WorkflowConfig Config, bool Replayed);

/// <summary>Lỗi theo trường; Stages gom lỗi theo khóa giai đoạn.</summary>
public sealed record WorkflowErrors(
    string? Name = null,
    string? DocType = null,
    string? Scope = null,
    IReadOnlyDictionary<string, string>? Stages = null)
{
    public bool IsEmpty => Name is null && DocType is null && Scope is null && (Stages is null || Stages.Count == 0);
}

public sealed class WorkflowConfigFailure(int status, string code, WorkflowErrors? errors = null) : Exception(code)
{
    public int Status { get; } = status;
    public string Code { get; } = code;
    public WorkflowErrors? Errors { get; } = errors;
}

#endregion

#region Lưu trữ

/// <summary>Phiên bản sắp lưu; store tự cấp số phiên bản kế tiếp của Code.</summary>
public sealed record NewWorkflowVersion(
    string Code,
    WorkflowDraft Draft,
    string Summary,
    string IdempotencyKey,
    string Fingerprint);

/// <summary>Kết quả của một Idempotency-Key đã xử lý trước đó.</summary>
public sealed record WorkflowReceipt(string Fingerprint, string Code);

public interface IWorkflowConfigStore
{
    Task<WorkflowCatalog> Catalog(CancellationToken ct);

    Task<IReadOnlyList<WorkflowConfig>> ActiveConfigs(CancellationToken ct);

    Task<WorkflowConfig?> Find(string code, CancellationToken ct);

    Task<WorkflowConfig?> ActiveFor(string docType, string scope, CancellationToken ct);

    /// <summary>
    /// Chạy <paramref name="action"/> trong một transaction ghi, tuần tự theo loại hồ sơ + phạm vi.
    /// Action ném lỗi thì không có gì được lưu.
    /// </summary>
    Task<T> Write<T>(Guid actorId, string docType, string scope, Func<IWorkflowConfigWrite, Task<T>> action, CancellationToken ct);
}

/// <summary>Các thao tác dùng bên trong transaction ghi.</summary>
public interface IWorkflowConfigWrite
{
    /// <summary>E1: kiểm tra lại người thao tác còn hoạt động và còn quyền workflows.manage.</summary>
    Task AssertAdmin(CancellationToken ct);

    Task<WorkflowCatalog> Catalog(CancellationToken ct);

    Task<WorkflowReceipt?> Receipt(string idempotencyKey, CancellationToken ct);

    Task<WorkflowConfig?> Find(string code, CancellationToken ct);

    Task<WorkflowConfig?> ActiveFor(string docType, string scope, CancellationToken ct);

    /// <summary>Tắt phiên bản đang áp dụng, thêm phiên bản mới làm đang áp dụng và ghi audit.</summary>
    Task<WorkflowConfig> Save(NewWorkflowVersion version, CancellationToken ct);
}

#endregion
