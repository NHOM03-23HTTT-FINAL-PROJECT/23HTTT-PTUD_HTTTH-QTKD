using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace QTKD.Application.Features.WorkflowConfigs;

/// <summary>
/// Luật thuần của SYS-CTR-10: thứ tự giai đoạn cố định, kiểm tra hợp lệ (bước 7 / E2),
/// mã cấu hình và tóm tắt thay đổi. Không truy cập DB.
/// </summary>
public static class WorkflowConfigRules
{
    #region Danh mục cố định

    public const int MaxPeoplePerList = 50;

    public static readonly IReadOnlyDictionary<string, (string Label, string Prefix)> DocTypes =
        new Dictionary<string, (string, string)>
        {
            ["contract"] = ("Hợp đồng", "HD"),
            ["appendix"] = ("Phụ lục", "PL"),
            ["cancel-agreement"] = ("Thỏa thuận hủy", "TH"),
            ["termination"] = ("Biên bản chấm dứt hợp đồng", "CD"),
        };

    public static readonly IReadOnlyDictionary<string, string> StageLabels = new Dictionary<string, string>
    {
        ["draft"] = "Lập & trình hồ sơ",
        ["sales"] = "Rà soát kinh doanh",
        ["dept-confirm"] = "Xác nhận bộ phận liên quan",
        ["legal"] = "Rà soát pháp lý",
        ["board"] = "Phê duyệt",
        ["signing"] = "Ký kết",
    };

    public static readonly IReadOnlySet<string> Modes = new HashSet<string> { "role-department", "specific", "rotation" };

    /// <summary>Giai đoạn rà soát hồ sơ: người tham gia không được đồng thời là người lập.</summary>
    private static readonly IReadOnlySet<string> ApprovalStages = new HashSet<string> { "sales", "dept-confirm", "legal", "board" };

    /// <summary>5 giai đoạn cố định; phụ lục có thêm "dept-confirm" ngay sau "sales" (A2).</summary>
    public static IReadOnlyList<string> StageKeys(string docType) => docType == "appendix"
        ? ["draft", "sales", "dept-confirm", "legal", "board", "signing"]
        : ["draft", "sales", "legal", "board", "signing"];

    /// <summary>VD: contract + KD → QT-HD-KD.</summary>
    public static string CodeFor(string docType, string scope) => $"QT-{DocTypes[docType].Prefix}-{scope}";

    #endregion

    #region Chuẩn hóa

    /// <summary>Cắt khoảng trắng, bỏ người trùng, đổi chuỗi rỗng thành null.</summary>
    public static WorkflowDraft Normalize(WorkflowDraft draft) => draft with
    {
        Name = Trim(draft.Name),
        DocType = Trim(draft.DocType),
        Scope = Trim(draft.Scope),
        Stages = (draft.Stages ?? []).Select(NormalizeStage).ToArray(),
    };

    private static WorkflowStage NormalizeStage(WorkflowStage stage) => stage with
    {
        Key = Trim(stage.Key),
        Role = Trim(stage.Role),
        Mode = Trim(stage.Mode),
        Participants = Distinct(stage.Participants),
        Backups = Distinct(stage.Backups),
        Notify = Distinct(stage.Notify),
        Condition = TrimOrNull(stage.Condition),
        ConfirmDepartment = TrimOrNull(stage.ConfirmDepartment),
    };

    private static string Trim(string? value) => (value ?? "").Trim();

    private static string? TrimOrNull(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    private static Guid[] Distinct(IReadOnlyList<Guid>? ids) => (ids ?? []).Distinct().ToArray();

    #endregion

    #region Kiểm tra hợp lệ

    /// <summary>
    /// Bước 7 / E2: đã chọn loại hồ sơ + phạm vi, đúng thứ tự giai đoạn, mỗi giai đoạn bật có người
    /// chưa bị vô hiệu hóa, không ai vừa lập vừa duyệt, người ký có thẩm quyền ký. Lỗi ghi theo từng giai đoạn.
    /// </summary>
    public static WorkflowErrors Validate(WorkflowDraft draft, WorkflowCatalog catalog)
    {
        var name = ValidateName(draft.Name);
        var docType = ValidateDocType(draft.DocType);
        var scope = ValidateScope(draft.Scope, catalog);
        if (docType is not null) return new(name, docType, scope);

        // Không được thêm, xóa hoặc đảo thứ tự giai đoạn (bước 4).
        var expected = StageKeys(draft.DocType);
        if (!draft.Stages.Select(s => s.Key).SequenceEqual(expected))
        {
            var order = string.Join(" → ", expected.Select(key => StageLabels[key]));
            return new(name, docType, scope, new Dictionary<string, string> { ["order"] = $"Giai đoạn phải đúng thứ tự cố định: {order}." });
        }

        var people = catalog.People.ToDictionary(p => p.Id);
        var drafters = draft.Stages.Single(s => s.Key == "draft").Participants.ToHashSet();
        var stageErrors = new Dictionary<string, string>();
        foreach (var stage in draft.Stages)
        {
            var error = ValidateStage(stage, people, catalog, drafters);
            if (error is not null) stageErrors[stage.Key] = error;
        }
        return new(name, docType, scope, stageErrors.Count == 0 ? null : stageErrors);
    }

    private static string? ValidateName(string name) => name.Length switch
    {
        0 => "Nhập tên cấu hình.",
        > 200 => "Tên cấu hình tối đa 200 ký tự.",
        _ => null,
    };

    private static string? ValidateDocType(string docType) =>
        docType.Length == 0 ? "Chọn loại hồ sơ."
        : !DocTypes.ContainsKey(docType) ? "Loại hồ sơ không hợp lệ."
        : null;

    private static string? ValidateScope(string scope, WorkflowCatalog catalog) =>
        scope.Length == 0 ? "Chọn phạm vi áp dụng."
        : !catalog.Scopes.Any(s => s.Code == scope) ? "Phạm vi áp dụng không hợp lệ."
        : null;

    /// <summary>Trả về lỗi đầu tiên của giai đoạn, hoặc null nếu hợp lệ.</summary>
    private static string? ValidateStage(WorkflowStage stage, IReadOnlyDictionary<Guid, WorkflowPerson> people,
        WorkflowCatalog catalog, IReadOnlySet<Guid> drafters)
    {
        if (!stage.Enabled)
            return stage.Key == "dept-confirm" ? null : "Giai đoạn bắt buộc, không được tắt.";

        return ValidateSettings(stage, catalog)
            ?? ValidatePeopleExist(stage, people)
            ?? ValidateParticipants(stage, people, drafters);
    }

    /// <summary>Vai trò, cách xác định người, điều kiện của giai đoạn xác nhận bộ phận.</summary>
    private static string? ValidateSettings(WorkflowStage stage, WorkflowCatalog catalog)
    {
        if (stage.Role.Length == 0 || stage.Role.Length > 100) return "Nhập vai trò tham gia (tối đa 100 ký tự).";
        if (!Modes.Contains(stage.Mode)) return "Chọn cách xác định người.";

        if (stage.Key != "dept-confirm")
        {
            return stage.Condition is not null || stage.ConfirmDepartment is not null
                ? "Chỉ giai đoạn xác nhận bộ phận liên quan có điều kiện áp dụng."
                : null;
        }
        if (stage.Condition is null || stage.ConfirmDepartment is null) return "Nhập điều kiện áp dụng và chọn bộ phận xác nhận.";
        if (stage.Condition.Length > 500) return "Điều kiện áp dụng tối đa 500 ký tự.";
        if (!catalog.Departments.Any(d => d.Code == stage.ConfirmDepartment)) return "Bộ phận xác nhận không hợp lệ.";
        return null;
    }

    private static string? ValidatePeopleExist(WorkflowStage stage, IReadOnlyDictionary<Guid, WorkflowPerson> people)
    {
        IReadOnlyList<Guid>[] lists = [stage.Participants, stage.Backups, stage.Notify];
        if (lists.Any(list => list.Count > MaxPeoplePerList)) return $"Mỗi danh sách tối đa {MaxPeoplePerList} người.";
        if (lists.SelectMany(list => list).Any(id => !people.ContainsKey(id))) return "Có người được chọn không tồn tại.";
        return null;
    }

    /// <summary>Người tham gia và người dự phòng: còn hoạt động, có thẩm quyền ký, không vừa lập vừa duyệt.</summary>
    private static string? ValidateParticipants(WorkflowStage stage, IReadOnlyDictionary<Guid, WorkflowPerson> people,
        IReadOnlySet<Guid> drafters)
    {
        var participants = stage.Participants.Select(id => people[id]).ToArray();
        if (participants.Length == 0) return "Giai đoạn chưa có người tham gia.";

        var assignable = participants.Concat(stage.Backups.Select(id => people[id])).ToArray();
        var disabled = assignable.Where(p => !p.Active).Select(p => p.Name).ToArray();
        if (disabled.Length > 0) return $"{string.Join(", ", disabled)} đã bị vô hiệu hóa. Chọn người khác.";

        if (stage.Key == "signing" && assignable.Any(p => !p.CanSign))
            return "Người ký đại diện hoặc người được ủy quyền ký không có thẩm quyền ký.";

        if (ApprovalStages.Contains(stage.Key) && assignable.Any(p => drafters.Contains(p.Id)))
            return "Một người không được vừa lập vừa duyệt cùng một hồ sơ.";

        return null;
    }

    #endregion

    #region Lịch sử phiên bản và idempotency

    /// <summary>Tóm tắt thay đổi cho lịch sử phiên bản (A5): giai đoạn nào khác phiên bản trước.</summary>
    public static string Summary(WorkflowDraft draft, string scopeName, WorkflowConfig? previous)
    {
        if (previous is null)
        {
            var enabled = draft.Stages.Count(s => s.Enabled);
            return $"Khởi tạo {enabled} giai đoạn cho {DocTypes[draft.DocType].Label} · {scopeName}.";
        }

        var changed = draft.Stages
            .Where(s => !SameStage(s, previous.Stages.FirstOrDefault(p => p.Key == s.Key)))
            .Select(s => StageLabels[s.Key])
            .ToArray();
        var renamed = draft.Name != previous.Name ? " Đổi tên cấu hình." : "";
        return changed.Length > 0
            ? $"Cập nhật người tham gia: {string.Join(", ", changed)}.{renamed}"
            : $"Kích hoạt lại không đổi người tham gia.{renamed}";
    }

    public static bool SameStage(WorkflowStage current, WorkflowStage? saved) =>
        saved is not null
        && current.Key == saved.Key
        && current.Enabled == saved.Enabled
        && current.Role == saved.Role
        && current.Mode == saved.Mode
        && current.Participants.SequenceEqual(saved.Participants)
        && current.Backups.SequenceEqual(saved.Backups)
        && current.Notify.SequenceEqual(saved.Notify)
        && current.Condition == saved.Condition
        && current.ConfirmDepartment == saved.ConfirmDepartment;

    /// <summary>Băm nội dung request; dùng lại Idempotency-Key với nội dung khác sẽ bị từ chối.</summary>
    public static string Fingerprint(object payload)
    {
        var json = JsonSerializer.Serialize(payload, JsonSerializerOptions.Web);
        return Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(json)));
    }

    #endregion
}
