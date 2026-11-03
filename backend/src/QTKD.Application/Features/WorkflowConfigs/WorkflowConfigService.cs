namespace QTKD.Application.Features.WorkflowConfigs;

/// <summary>
/// SYS-CTR-10: xem, kiểm tra và kích hoạt cấu hình người tham gia.
/// Mỗi lần lưu tạo một phiên bản mới, không sửa được, và trở thành phiên bản đang áp dụng duy nhất
/// của loại hồ sơ + phạm vi. Lượt duyệt giữ snapshot gắn lúc trình nên không bị ảnh hưởng.
/// API yêu cầu workflows.manage; thao tác ghi kiểm tra lại quyền trong transaction.
/// </summary>
public sealed class WorkflowConfigService(IWorkflowConfigStore store)
{
    #region Đọc

    /// <summary>10.1: mỗi loại hồ sơ × phạm vi một dòng, kể cả dòng chưa cấu hình.</summary>
    public async Task<IReadOnlyList<WorkflowConfigRow>> List(CancellationToken ct)
    {
        var catalog = await store.Catalog(ct);
        var active = await store.ActiveConfigs(ct);

        var rows = new List<WorkflowConfigRow>();
        foreach (var scope in catalog.Scopes)
        {
            foreach (var docType in WorkflowConfigRules.DocTypes.Keys)
            {
                var config = active.FirstOrDefault(c => c.DocType == docType && c.Scope == scope.Code);
                rows.Add(new(docType, scope.Code, scope.Name, config));
            }
        }
        return rows;
    }

    public async Task<WorkflowConfig> Get(string code, CancellationToken ct) =>
        await store.Find(code, ct) ?? throw new WorkflowConfigFailure(404, "NOT_FOUND");

    public Task<WorkflowCatalog> Catalog(CancellationToken ct) => store.Catalog(ct);

    /// <summary>Bước 6–7 "Kiểm tra cấu hình": kiểm tra hợp lệ và phạm vi trùng (E3), không ghi.</summary>
    public async Task<CheckWorkflowResult> Check(CheckWorkflowRequest request, CancellationToken ct)
    {
        var draft = WorkflowConfigRules.Normalize(request.Draft ?? throw new WorkflowConfigFailure(400, "VALIDATION"));
        var errors = WorkflowConfigRules.Validate(draft, await store.Catalog(ct));

        var canLookUpScope = errors.DocType is null && errors.Scope is null;
        var active = canLookUpScope ? await store.ActiveFor(draft.DocType, draft.Scope, ct) : null;
        var duplicate = active is not null && active.Code != request.Code;

        return new(errors.IsEmpty && !duplicate, errors.IsEmpty ? null : errors, duplicate);
    }

    #endregion

    #region Ghi

    /// <summary>Bước 3–10: tạo phiên bản đầu, hoặc thay phiên bản đang áp dụng của cùng phạm vi khi được xác nhận (E3).</summary>
    public Task<ActivateWorkflowResult> Create(Guid actorId, string idempotencyKey, CreateWorkflowRequest request, CancellationToken ct) =>
        Activate(actorId, idempotencyKey, code: null, baseVersion: null, request.Draft, request.ReplaceExisting, ct);

    /// <summary>A1: lưu chỉnh sửa thành phiên bản mới; BaseVersion phát hiện sửa đồng thời (E4).</summary>
    public Task<ActivateWorkflowResult> Update(Guid actorId, string idempotencyKey, string code, UpdateWorkflowRequest request, CancellationToken ct) =>
        Activate(actorId, idempotencyKey, code, request.BaseVersion, request.Draft, replaceExisting: false, ct);

    private async Task<ActivateWorkflowResult> Activate(Guid actorId, string idempotencyKey, string? code, int? baseVersion,
        WorkflowDraft? input, bool replaceExisting, CancellationToken ct)
    {
        idempotencyKey = (idempotencyKey ?? "").Trim();
        if (idempotencyKey.Length is 0 or > 100) throw new WorkflowConfigFailure(400, "IDEMPOTENCY_KEY_REQUIRED");

        var draft = WorkflowConfigRules.Normalize(input ?? throw new WorkflowConfigFailure(400, "VALIDATION"));
        var fingerprint = WorkflowConfigRules.Fingerprint(new { code, baseVersion, replaceExisting, draft });

        return await store.Write(actorId, draft.DocType, draft.Scope, async write =>
        {
            await write.AssertAdmin(ct);

            // E6: gửi lặp trả lại kết quả cũ, không tạo thêm phiên bản.
            var replay = await Replay(write, idempotencyKey, fingerprint, ct);
            if (replay is not null) return replay;

            var catalog = await write.Catalog(ct);
            var errors = WorkflowConfigRules.Validate(draft, catalog);
            if (!errors.IsEmpty) throw new WorkflowConfigFailure(400, "VALIDATION", errors);

            var previous = await PreviousVersion(write, code, baseVersion, draft, replaceExisting, ct);
            var scopeName = catalog.Scopes.Single(s => s.Code == draft.Scope).Name;
            var version = new NewWorkflowVersion(
                Code: previous?.Code ?? WorkflowConfigRules.CodeFor(draft.DocType, draft.Scope),
                Draft: draft,
                Summary: WorkflowConfigRules.Summary(draft, scopeName, previous),
                IdempotencyKey: idempotencyKey,
                Fingerprint: fingerprint);

            return new ActivateWorkflowResult(await write.Save(version, ct), Replayed: false);
        }, ct);
    }

    private static async Task<ActivateWorkflowResult?> Replay(IWorkflowConfigWrite write, string idempotencyKey, string fingerprint, CancellationToken ct)
    {
        var receipt = await write.Receipt(idempotencyKey, ct);
        if (receipt is null) return null;
        if (receipt.Fingerprint != fingerprint) throw new WorkflowConfigFailure(409, "IDEMPOTENCY_KEY_REUSED");
        return new ActivateWorkflowResult((await write.Find(receipt.Code, ct))!, Replayed: true);
    }

    /// <summary>
    /// Phiên bản sẽ bị thay thế, hoặc null khi phạm vi chưa có cấu hình.
    /// Tạo mới: phạm vi đã có cấu hình thì cần replaceExisting (E3).
    /// Cập nhật: không đổi loại hồ sơ/phạm vi, và phiên bản đang áp dụng phải đúng baseVersion (E4).
    /// </summary>
    private static async Task<WorkflowConfig?> PreviousVersion(IWorkflowConfigWrite write, string? code, int? baseVersion,
        WorkflowDraft draft, bool replaceExisting, CancellationToken ct)
    {
        var active = await write.ActiveFor(draft.DocType, draft.Scope, ct);

        if (code is null)
        {
            if (active is not null && !replaceExisting) throw new WorkflowConfigFailure(409, "DUPLICATE_SCOPE");
            return active;
        }

        var current = await write.Find(code, ct) ?? throw new WorkflowConfigFailure(404, "NOT_FOUND");
        if (current.DocType != draft.DocType || current.Scope != draft.Scope)
            throw new WorkflowConfigFailure(400, "VALIDATION", new(DocType: "Không đổi loại hồ sơ hoặc phạm vi khi cập nhật; tạo cấu hình mới."));
        if (active?.Code != current.Code || active.Version != baseVersion)
            throw new WorkflowConfigFailure(409, "CONFLICT");
        return current;
    }

    #endregion
}
