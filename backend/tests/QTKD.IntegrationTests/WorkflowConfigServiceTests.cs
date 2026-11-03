using QTKD.Application.Features.WorkflowConfigs;
using Xunit;

namespace QTKD.IntegrationTests;

// SYS-CTR-10 service rules against an in-memory store. SQL, locks and the DB triggers are covered by
// WorkflowConfigPostgresRollbackTests (opt-in, needs a disposable PostgreSQL database).
public sealed class WorkflowConfigServiceTests
{
    internal static readonly Guid Drafter = Guid.NewGuid(), Manager = Guid.NewGuid(), Legal = Guid.NewGuid(),
        Board = Guid.NewGuid(), Disabled = Guid.NewGuid(), NoSign = Guid.NewGuid();
    internal static WorkflowCatalog Catalog() => new(
        [new(Drafter, "Drafter", "NV KD", "KD", "Kinh doanh", true, false), new(Manager, "Manager", "TP KD", "KD", "Kinh doanh", true, false),
         new(Legal, "Legal", "Pháp chế", "PC", "Pháp chế", true, false), new(Board, "Board", "BGĐ", "BGD", "Ban Giám đốc", true, true),
         new(Disabled, "Disabled", "BGĐ", "BGD", "Ban Giám đốc", false, true), new(NoSign, "NoSign", "BGĐ", "BGD", "Ban Giám đốc", true, false)],
        [new("KD", "Kinh doanh")], [new("KD", "Kinh doanh"), new("KT", "Khai thác"), new("PC", "Pháp chế"), new("BGD", "Ban Giám đốc")]);

    internal static WorkflowDraft Draft(string docType = "contract", string name = "Hợp đồng KD")
    {
        WorkflowStage S(string key, params Guid[] people) => new(key, true, "Vai trò", "specific", people, [], []);
        var stages = new List<WorkflowStage> { S("draft", Drafter), S("sales", Manager), S("legal", Legal), S("board", Board), S("signing", Board) };
        if (docType == "appendix") stages.Insert(2, new("dept-confirm", false, "Trưởng bộ phận", "specific", [], [], []));
        return new(name, docType, "KD", stages);
    }
    private static WorkflowDraft With(WorkflowDraft draft, string key, Func<WorkflowStage, WorkflowStage> change) =>
        draft with { Stages = draft.Stages.Select(s => s.Key == key ? change(s) : s).ToArray() };

    private readonly MemoryWorkflowConfigStore store = new(Catalog());
    private WorkflowConfigService Service => new(store);
    private static readonly Guid Admin = Guid.NewGuid();

    [Fact]
    public async Task Create_activates_version_1_and_writes_one_audit_row()
    {
        var result = await Service.Create(Admin, "k1", new(Draft()), default);
        Assert.False(result.Replayed);
        Assert.Equal(("QT-HD-KD", 1), (result.Config.Code, result.Config.Version));
        Assert.Single(result.Config.History);
        Assert.Single(store.Audit);
        var rows = await Service.List(default);
        Assert.Equal(4, rows.Count);
        Assert.Equal("QT-HD-KD", Assert.Single(rows, r => r.Config is not null).Config!.Code);
    }

    [Fact]
    public async Task Update_creates_new_version_and_keeps_previous_version_unchanged()
    {
        var v1 = (await Service.Create(Admin, "k1", new(Draft()), default)).Config;
        var edited = With(Draft(), "legal", s => s with { Participants = [Legal, Manager] });
        var v2 = (await Service.Update(Admin, "k2", v1.Code, new(1, edited), default)).Config;
        Assert.Equal(2, v2.Version);
        Assert.Equal([1, 2], v2.History.Select(h => h.Version));
        Assert.Equal(v1.Stages, v2.History[0].Stages);
        Assert.Contains("Rà soát pháp lý", v2.History[1].Summary);
    }

    [Fact]
    public async Task Stale_base_version_is_a_conflict_and_saves_nothing()
    {
        var v1 = (await Service.Create(Admin, "k1", new(Draft()), default)).Config;
        await Service.Update(Admin, "k2", v1.Code, new(1, Draft(name: "Other admin")), default);
        var error = await Assert.ThrowsAsync<WorkflowConfigFailure>(() => Service.Update(Admin, "k3", v1.Code, new(1, Draft(name: "Mine")), default));
        Assert.Equal("CONFLICT", error.Code);
        Assert.Equal(2, (await Service.Get(v1.Code, default)).Version);
    }

    [Fact]
    public async Task Duplicate_scope_requires_explicit_replacement()
    {
        await Service.Create(Admin, "k1", new(Draft()), default);
        var error = await Assert.ThrowsAsync<WorkflowConfigFailure>(() => Service.Create(Admin, "k2", new(Draft(name: "Again")), default));
        Assert.Equal("DUPLICATE_SCOPE", error.Code);
        Assert.True((await Service.Check(new(Draft()), default)).DuplicateScope);
        Assert.False((await Service.Check(new(Draft(), "QT-HD-KD"), default)).DuplicateScope);
        var replaced = (await Service.Create(Admin, "k3", new(Draft(name: "Again"), ReplaceExisting: true), default)).Config;
        Assert.Equal(("QT-HD-KD", 2, "Again"), (replaced.Code, replaced.Version, replaced.Name));
    }

    [Fact]
    public async Task Repeated_request_replays_and_reused_key_with_other_payload_is_rejected()
    {
        var first = await Service.Create(Admin, "same", new(Draft()), default);
        var again = await Service.Create(Admin, "same", new(Draft()), default);
        Assert.True(again.Replayed);
        Assert.Equal(first.Config.Version, again.Config.Version);
        Assert.Single(store.Audit);
        var error = await Assert.ThrowsAsync<WorkflowConfigFailure>(() => Service.Create(Admin, "same", new(Draft(name: "Different")), default));
        Assert.Equal("IDEMPOTENCY_KEY_REUSED", error.Code);
    }

    [Fact]
    public async Task Revoked_permission_blocks_activation()
    {
        store.Admin = false;
        var error = await Assert.ThrowsAsync<WorkflowConfigFailure>(() => Service.Create(Admin, "k1", new(Draft()), default));
        Assert.Equal((403, "FORBIDDEN"), (error.Status, error.Code));
        Assert.Empty(store.Rows);
    }

    [Fact]
    public async Task Changing_type_or_scope_on_update_is_rejected()
    {
        var v1 = (await Service.Create(Admin, "k1", new(Draft()), default)).Config;
        var error = await Assert.ThrowsAsync<WorkflowConfigFailure>(() => Service.Update(Admin, "k2", v1.Code, new(1, Draft("termination")), default));
        Assert.Equal("VALIDATION", error.Code);
    }

    public static TheoryData<string, string> InvalidStages() => new()
    {
        { "missing", "sales" }, { "disabled", "board" }, { "cannot-sign", "signing" }, { "drafter-reviews", "legal" },
        { "required-off", "board" }, { "dept-confirm-no-condition", "dept-confirm" }, { "unknown-person", "sales" }, { "bad-mode", "draft" },
    };
    [Theory]
    [MemberData(nameof(InvalidStages))]
    public async Task Invalid_stage_is_reported_on_that_stage_and_nothing_is_saved(string problem, string key)
    {
        var draft = problem switch
        {
            "missing" => With(Draft(), "sales", s => s with { Participants = [] }),
            "disabled" => With(Draft(), "board", s => s with { Participants = [Disabled] }),
            "cannot-sign" => With(Draft(), "signing", s => s with { Participants = [NoSign] }),
            "drafter-reviews" => With(Draft(), "legal", s => s with { Backups = [Drafter] }),
            "required-off" => With(Draft(), "board", s => s with { Enabled = false }),
            "dept-confirm-no-condition" => With(Draft("appendix"), "dept-confirm", s => s with { Enabled = true, Participants = [Manager] }),
            "unknown-person" => With(Draft(), "sales", s => s with { Participants = [Guid.NewGuid()] }),
            _ => With(Draft(), "draft", s => s with { Mode = "anyone" }),
        };
        var error = await Assert.ThrowsAsync<WorkflowConfigFailure>(() => Service.Create(Admin, "k1", new(draft), default));
        Assert.Equal((400, "VALIDATION"), (error.Status, error.Code));
        Assert.True(error.Errors!.Stages!.ContainsKey(key), string.Join(",", error.Errors.Stages.Keys));
        Assert.Empty(store.Rows);
    }

    [Fact]
    public void Stage_order_and_optional_appendix_stage_are_fixed()
    {
        var reordered = Draft() with { Stages = Draft().Stages.Reverse().ToArray() };
        Assert.True(WorkflowConfigRules.Validate(WorkflowConfigRules.Normalize(reordered), Catalog()).Stages!.ContainsKey("order"));
        var extra = Draft() with { Stages = Draft("appendix").Stages };
        Assert.True(WorkflowConfigRules.Validate(WorkflowConfigRules.Normalize(extra), Catalog()).Stages!.ContainsKey("order"));
        var appendix = With(Draft("appendix"), "dept-confirm", s => s with { Enabled = true, Participants = [Manager], Condition = "Khu vực", ConfirmDepartment = "KT" });
        Assert.True(WorkflowConfigRules.Validate(WorkflowConfigRules.Normalize(appendix), Catalog()).IsEmpty);
        Assert.True(WorkflowConfigRules.Validate(WorkflowConfigRules.Normalize(Draft("appendix")), Catalog()).IsEmpty);
    }

    [Fact]
    public async Task Missing_idempotency_key_is_rejected()
    {
        var error = await Assert.ThrowsAsync<WorkflowConfigFailure>(() => Service.Create(Admin, " ", new(Draft()), default));
        Assert.Equal("IDEMPOTENCY_KEY_REQUIRED", error.Code);
    }
}

internal sealed class MemoryWorkflowConfigStore(WorkflowCatalog catalog) : IWorkflowConfigStore, IWorkflowConfigWrite
{
    public bool Admin { get; set; } = true;
    public List<(WorkflowConfig Header, WorkflowVersion Version, bool Active)> Rows { get; } = [];
    public List<(string Key, string Fingerprint, string Code)> Audit { get; } = [];
    private readonly SemaphoreSlim gate = new(1, 1);

    public Task<WorkflowCatalog> Catalog(CancellationToken ct) => Task.FromResult(catalog);
    public Task<IReadOnlyList<WorkflowConfig>> ActiveConfigs(CancellationToken ct) =>
        Task.FromResult<IReadOnlyList<WorkflowConfig>>(Rows.Where(r => r.Active).Select(r => Build(r.Header.Code)!).ToArray());
    public Task<WorkflowConfig?> Find(string code, CancellationToken ct) => Task.FromResult(Build(code));
    public Task<WorkflowConfig?> ActiveFor(string docType, string scope, CancellationToken ct) =>
        Task.FromResult(Rows.Where(r => r.Active && r.Header.DocType == docType && r.Header.Scope == scope).Select(r => Build(r.Header.Code)).FirstOrDefault());
    public async Task<T> Write<T>(Guid actorId, string docType, string scope, Func<IWorkflowConfigWrite, Task<T>> action, CancellationToken ct)
    {
        await gate.WaitAsync(ct);
        var (rows, audit) = (Rows.ToList(), Audit.ToList());
        try { return await action(this); }
        catch { Rows.Clear(); Rows.AddRange(rows); Audit.Clear(); Audit.AddRange(audit); throw; }
        finally { gate.Release(); }
    }
    public Task AssertAdmin(CancellationToken ct) => Admin ? Task.CompletedTask : throw new WorkflowConfigFailure(403, "FORBIDDEN");
    public Task<WorkflowReceipt?> Receipt(string key, CancellationToken ct) =>
        Task.FromResult(Audit.Where(a => a.Key == key).Select(a => new WorkflowReceipt(a.Fingerprint, a.Code)).FirstOrDefault());
    public Task<WorkflowConfig> Save(NewWorkflowVersion version, CancellationToken ct)
    {
        var d = version.Draft;
        for (var i = 0; i < Rows.Count; i++)
            if (Rows[i].Active && (Rows[i].Header.Code == version.Code || (Rows[i].Header.DocType == d.DocType && Rows[i].Header.Scope == d.Scope)))
                Rows[i] = Rows[i] with { Active = false };
        var next = Rows.Where(r => r.Header.Code == version.Code).Select(r => r.Version.Version).DefaultIfEmpty(0).Max() + 1;
        var header = new WorkflowConfig(version.Code, d.Name, d.DocType, d.Scope, "Kinh doanh", next, DateTime.UtcNow, "Admin", d.Stages, []);
        Rows.Add((header, new(next, header.ActivatedAt, "Admin", version.Summary, d.Stages), true));
        Audit.Add((version.IdempotencyKey, version.Fingerprint, version.Code));
        return Task.FromResult(Build(version.Code)!);
    }
    private WorkflowConfig? Build(string code)
    {
        var rows = Rows.Where(r => r.Header.Code == code).OrderBy(r => r.Version.Version).ToArray();
        var active = rows.SingleOrDefault(r => r.Active);
        return active.Header is null ? null : active.Header with { History = rows.Select(r => r.Version).ToArray() };
    }
}
