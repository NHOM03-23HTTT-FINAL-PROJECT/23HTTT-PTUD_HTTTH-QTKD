using System.Text.Json;
using System.Text.Json.Nodes;
using QTKD.Application.Common.Interfaces;
using QTKD.Application.Features.Contracts;
using QTKD.Domain.Contracts;
using Xunit;

namespace QTKD.UnitTests.Contracts;

// SYS-CTR-04 in ContractService with a fake repository: checks E1–E5, the order of writes, notification and audit text,
// and the contract detail built from the repository records.
public sealed class ContractSubmissionServiceTests
{
    private static readonly Guid Owner = Guid.NewGuid();
    private static readonly DateTime At = new(2026, 11, 5, 3, 12, 45, 123, DateTimeKind.Utc);
    private readonly Actor actor = new(Owner, "SalesStaff", Guid.NewGuid(), "NV KD");
    private readonly FakeRepository repository = new();
    private ContractService Service() => new(null!, repository);

    private static ContractRecord Contract(string status = "Draft", IReadOnlyList<ContractItemRecord>? items = null,
        IReadOnlyList<ContractAttachmentRecord>? attachments = null, IReadOnlyList<ApprovalRoundRecord>? rounds = null) =>
        new(Guid.NewGuid(), "HD-1", "HĐ Demo", "Dịch vụ", "blank", null, new DateOnly(2026, 11, 2), new DateOnly(2026, 12, 2),
            123.45m, "30 ngày", "Nội dung", status, Owner, "NV KD", null, "KH-1", "Khách hàng", """{"name":"Khách hàng"}""", 3, At, At,
            items ?? [new(Guid.NewGuid(), "DV-1", "Vận chuyển", "Chuyến", true, "HN", true)],
            attachments ?? [new(Guid.NewGuid(), "hd.pdf", 10)],
            rounds ?? [], [], null, null, []);

    [Fact]
    public async Task Check_returns_the_sales_reviewer_and_resubmit_flag_without_cancellation_check()
    {
        repository.Current = Contract("RevisionRequested");

        var result = await Service().SubmitCheck(actor, "HD-1", default);

        Assert.Equal("""{"salesReviewer":"TP KD","resubmit":true}""", result.ToJsonString());
        Assert.Equal(["find", "areas", "reviewer"], repository.Calls);
    }

    [Fact]
    public async Task Outside_scope_is_not_found()
    {
        repository.Current = null;
        var error = await Assert.ThrowsAsync<BusinessException>(() => Service().SubmitCheck(actor, "HD-1", default));
        Assert.Equal(("NOT_FOUND", 404), (error.Code, error.Status));
    }

    [Fact]
    public async Task Not_owner_or_not_editable_is_rejected_before_any_other_check()
    {
        repository.Current = Contract();
        var other = new Actor(Guid.NewGuid(), "SalesStaff", Guid.NewGuid(), "Khác");
        Assert.Equal("NOT_OWNER", (await Assert.ThrowsAsync<BusinessException>(() => Service().SubmitCheck(other, "HD-1", default))).Code);

        repository.Current = Contract("Submitted");
        Assert.Equal("STATUS", (await Assert.ThrowsAsync<BusinessException>(() => Service().SubmitCheck(actor, "HD-1", default))).Code);
        Assert.DoesNotContain("areas", repository.Calls);
    }

    [Fact]
    public async Task Missing_information_lists_every_item()
    {
        repository.Current = Contract(items: [new(Guid.NewGuid(), "DV-2", "Kho bãi", "m2", true, null, null)], attachments: []);

        var error = await Assert.ThrowsAsync<BusinessException>(() => Service().SubmitCheck(actor, "HD-1", default));

        Assert.Equal(("MISSING", 409), (error.Code, error.Status));
        Assert.Equal(["Khu vực thực hiện của \"Kho bãi\"", "Tệp hợp đồng hoặc tài liệu đính kèm (ít nhất 1 tệp)"], Items(error));

        repository.Current = Contract(items: []);
        var empty = await Assert.ThrowsAsync<BusinessException>(() => Service().SubmitCheck(actor, "HD-1", default));
        Assert.Equal(["Ít nhất một hạng mục dịch vụ"], Items(empty));
    }

    [Fact]
    public async Task Inactive_area_and_missing_reviewer_block_submission()
    {
        repository.Current = Contract();
        repository.InactiveAreas = ["Vận chuyển · HN"];
        var inactive = await Assert.ThrowsAsync<BusinessException>(() => Service().SubmitCheck(actor, "HD-1", default));
        Assert.Equal("AREA_INACTIVE", inactive.Code);
        Assert.Equal(["Vận chuyển · HN"], Items(inactive));

        repository.InactiveAreas = [];
        repository.Reviewer = null;
        Assert.Equal("NO_APPROVER", (await Assert.ThrowsAsync<BusinessException>(() => Service().SubmitCheck(actor, "HD-1", default))).Code);
    }

    [Fact]
    public async Task Pending_cancellation_blocks_submit()
    {
        repository.Current = Contract("RevisionRequested");
        repository.PendingCancellation = true;
        var error = await Assert.ThrowsAsync<BusinessException>(() => Service().Submit(actor, "HD-1", "key", default));
        Assert.Equal("CANCELLATION_PENDING", error.Code);
        Assert.DoesNotContain("mark", repository.Calls);
    }

    [Fact]
    public async Task Submit_runs_once_in_the_idempotent_transaction_and_writes_in_order()
    {
        repository.Current = Contract();

        var result = await Service().Submit(actor, "HD-1", "key-1", default);

        Assert.Equal(("contracts:HD-1:submit", "key-1", """{"code":"HD-1"}"""), repository.Idempotency);
        Assert.Equal(["find", "pending", "areas", "reviewer", "mark", "pending", "round", "notify", "find", "audit"], repository.Calls);
        Assert.Equal((repository.Reviewer!.Id, "Hồ sơ HD-1 – HĐ Demo cần Rà soát kinh doanh."), repository.Notification);
        Assert.Equal(("CONTRACT_SUBMITTED", "Draft", "Submitted", "Lượt 1"), (repository.Audit!.Value.Action, repository.Audit.Value.Before,
            repository.Audit.Value.After, repository.Audit.Value.Note));
        Assert.Equal("NV KD", repository.Audit.Value.Value["auditActor"]!["name"]!.GetValue<string>());
        Assert.False(result["replayed"]!.GetValue<bool>());
        Assert.Null(result["contract"]!["auditActor"]);
    }

    [Fact]
    public async Task Contract_changed_concurrently_is_read_and_checked_again()
    {
        repository.Current = Contract();
        repository.MarkResults.Enqueue(false);

        await Service().Submit(actor, "HD-1", "key", default);

        Assert.Equal(["find", "pending", "areas", "reviewer", "mark", "find", "pending", "areas", "reviewer", "mark", "pending"],
            repository.Calls.Take(11));
    }

    [Fact]
    public async Task Resubmission_after_revision_notes_the_new_round()
    {
        repository.Current = Contract("RevisionRequested");
        repository.RoundNo = 2;

        await Service().Submit(actor, "HD-1", "key-2", default);

        Assert.Equal("Trình lại, lượt 2", repository.Audit!.Value.Note);
    }

    [Fact]
    public async Task Submit_requires_an_idempotency_key()
    {
        var error = await Assert.ThrowsAsync<BusinessException>(() => Service().Submit(actor, "HD-1", " ", default));
        Assert.Equal(("IDEMPOTENCY_KEY_REQUIRED", 400), (error.Code, error.Status));
        Assert.Empty(repository.Calls);
    }

    [Fact]
    public async Task Detail_maps_round_steps_like_the_contract_detail_api()
    {
        var steps = new ApprovalStepRecord[]
        {
            new(Guid.NewGuid(), 1, "Rà soát kinh doanh", Guid.NewGuid(), "TP KD", "SalesManager", At, null, "Completed", "Approve", "TP KD", At, "Ổn"),
            new(Guid.NewGuid(), 2, "Rà soát pháp lý", null, null, null, null, null, "NotStarted", null, null, null, "Ý kiến pháp chế"),
            new(Guid.NewGuid(), 3, "Phê duyệt", Guid.NewGuid(), "BGĐ", "BoardMember", null, null, "NotStarted", null, null, null, null)
        };
        var round = new ApprovalRoundRecord(Guid.NewGuid(), 1, Owner, "NV KD", At, 3,
            """{"workflow":{"version":1,"stages":["SalesManager","LegalStaff","BoardMember"]}}""", null, "Running", steps, []);
        repository.Current = Contract("RevisionRequested", rounds: [round]);
        repository.PendingCancellation = false;

        var detail = (await Service().Submit(actor, "HD-1", "key", default))["contract"]!;

        Assert.Equal(("2026-11-02", "2026-11-05T03:12:45.123+00:00", "revision-requested", 123.45m),
            (detail["effectiveFrom"]!.GetValue<string>(), detail["createdAt"]!.GetValue<string>(), detail["status"]!.GetValue<string>(),
                detail["value"]!.GetValue<decimal>()));
        var r = detail["rounds"]![0]!;
        Assert.Equal(("in-progress", ""), (r["result"]!.GetValue<string>(), r["configCode"]!.GetValue<string>()));
        Assert.Equal(["sales", "legal", "board"], r["steps"]!.AsArray().Select(s => s!["key"]!.GetValue<string>()));
        Assert.Equal(["done", "unassigned", "waiting"], r["steps"]!.AsArray().Select(s => s!["state"]!.GetValue<string>()));
        Assert.Equal(3, r["steps"]![0]!["reviewedVersion"]!.GetValue<int>());
        Assert.Null(r["steps"]![1]!["comment"]);
        Assert.True(detail.AsObject().ContainsKey("revisionRequest"));
        Assert.Null(detail["revisionRequest"]);
        Assert.Equal("/api/v1/contracts/HD-1/attachments/" + repository.Current.Attachments[0].Id,
            detail["attachments"]![0]!["downloadUrl"]!.GetValue<string>());
    }

    [Fact]
    public async Task Detail_builds_the_round_log_from_audited_actions()
    {
        const string Stages = """{"workflow":{"version":1,"stages":["SalesManager","LegalStaff","BoardMember"]}}""";
        // Accept/decision times are left out here so that only the audit rows feed the log.
        ApprovalStepRecord[] Steps() =>
        [
            new(Guid.NewGuid(), 1, "Rà soát kinh doanh", Guid.NewGuid(), "TP KD", "SalesManager", At, null, "Completed", "Approve", "TP KD", null, null),
            new(Guid.NewGuid(), 2, "Rà soát pháp lý", Guid.NewGuid(), "NV PC", "LegalStaff", At, null, "Completed", "RequestRevision", "NV PC", null, "Bổ sung điều khoản"),
            new(Guid.NewGuid(), 3, "Phê duyệt", null, null, null, null, null, "Skipped", null, null, null, null)
        ];
        var first = Steps();
        ApprovalLogRecord L(int minutes, ApprovalStepRecord step, string action, string? from, string? to, string? note = null) =>
            new(At.AddMinutes(minutes), step.Id, action, step.DecidedByName ?? "TP PC", from, to, note);
        var round1 = new ApprovalRoundRecord(Guid.NewGuid(), 1, Owner, "NV KD", At, 3, Stages, At.AddMinutes(9), "RevisionRequested", first,
        [
            // Deliberately out of order: the log is sorted by time.
            L(5, first[1], "APPROVER_ASSIGNED", null, null, "Giao cho NV PC"),
            L(1, first[0], "REVIEW_ACCEPTED", "submitted", "under-review"),
            L(2, first[0], "REVIEW_APPROVED", "under-review", "under-review", "Ổn"),
            L(3, first[0], "REVIEW_HANDED_OFF", "under-review", "under-review"),
            L(8, first[1], "REVIEW_REVISION_REQUESTED", "under-review", "revision-requested", "Bổ sung điều khoản"),
            L(9, first[1], "UNKNOWN_ACTION", null, null)
        ]);
        var round2 = new ApprovalRoundRecord(Guid.NewGuid(), 2, Owner, "NV KD", At.AddDays(1), 4, Stages, null, "Running", Steps(), []);
        repository.Current = Contract("RevisionRequested", rounds: [round1, round2]);

        var detail = (await Service().Submit(actor, "HD-1", "key", default))["contract"]!;

        var log = detail["rounds"]![0]!["log"]!.AsArray();
        Assert.Equal(["submit", "accept", "approve", "handoff-legal", "assign", "request-revision"],
            log.Select(e => e!["action"]!.GetValue<string>()));
        Assert.Equal(("draft", "submitted"), (log[0]!["from"]!.GetValue<string>(), log[0]!["to"]!.GetValue<string>()));
        // The assignment carries the status the contract had at that time.
        Assert.Equal(("legal", "under-review", "under-review"),
            (log[4]!["stepKey"]!.GetValue<string>(), log[4]!["from"]!.GetValue<string>(), log[4]!["to"]!.GetValue<string>()));
        // Legal notes are hidden from a sales actor (A9); sales notes are not.
        Assert.True(log[5]!["internal"]!.GetValue<bool>());
        Assert.Null(log[5]!["note"]);
        Assert.Equal("Ổn", log[2]!["note"]!.GetValue<string>());
        Assert.Equal(3, log[5]!["version"]!.GetValue<int>());

        var resubmit = detail["rounds"]![1]!["log"]!.AsArray();
        Assert.Equal(("submit", "revision-requested"), (resubmit.Single()!["action"]!.GetValue<string>(), resubmit[0]!["from"]!.GetValue<string>()));
    }

    [Fact]
    public async Task Detail_logs_steps_decided_without_audit_rows_like_demo_seed_data()
    {
        // Same timestamp for accept and decision, as in demo-seed.json: accept still comes first.
        var steps = new ApprovalStepRecord[]
        {
            new(Guid.NewGuid(), 1, "Rà soát kinh doanh", Guid.NewGuid(), "TP KD", "SalesManager", At, At.AddHours(1), "Completed", "Approve", null, At.AddHours(1), "Đồng ý"),
            new(Guid.NewGuid(), 2, "Rà soát pháp lý", Guid.NewGuid(), "NV PC", "LegalStaff", At, At.AddHours(2), "Completed", "Approve", "NV PC", At.AddHours(2), "Ổn"),
            new(Guid.NewGuid(), 3, "Phê duyệt", Guid.NewGuid(), "GĐ", "BoardMember", At, At.AddHours(3), "Completed", "Approve", "GĐ", At.AddHours(3), null)
        };
        var round = new ApprovalRoundRecord(Guid.NewGuid(), 1, Owner, "NV KD", At, 3,
            """{"workflow":{"version":1,"stages":["SalesManager","LegalStaff","BoardMember"]}}""", At.AddHours(3), "Completed", steps, []);
        repository.Current = Contract("RevisionRequested", rounds: [round]);

        var log = (await Service().Submit(actor, "HD-1", "key", default))["contract"]!["rounds"]![0]!["log"]!.AsArray();

        Assert.Equal(["submit", "accept", "approve", "accept", "approve", "accept", "approve"], log.Select(e => e!["action"]!.GetValue<string>()));
        Assert.Equal(("TP KD", "submitted", "under-review"),
            (log[1]!["actorName"]!.GetValue<string>(), log[1]!["from"]!.GetValue<string>(), log[1]!["to"]!.GetValue<string>()));
        Assert.Equal(("Đồng ý", "under-review", "approved"),
            (log[2]!["note"]!.GetValue<string>(), log[5]!["from"]!.GetValue<string>(), log[6]!["to"]!.GetValue<string>()));
    }

    private static string[] Items(BusinessException error) =>
        JsonSerializer.SerializeToNode(error.Details)!["items"]!.AsArray().Select(i => i!.GetValue<string>()).ToArray();

    private sealed class FakeRepository : IContractRepository
    {
        public ContractRecord? Current;
        public bool PendingCancellation;
        public IReadOnlyList<string> InactiveAreas = [];
        public SalesReviewer? Reviewer = new(Guid.NewGuid(), "TP KD");
        public int RoundNo = 1;
        public Queue<bool> MarkResults { get; } = new();
        public List<string> Calls { get; } = [];
        public (string Operation, string Key, string Payload)? Idempotency;
        public (Guid Recipient, string Content)? Notification;
        public (string Action, string? Before, string After, string? Note, JsonObject Value)? Audit;

        public Task<JsonObject> IdempotentAsync(Actor actor, string operation, string key, object payload, Func<Task<JsonObject>> action, CancellationToken ct)
        {
            Idempotency = (operation, key, JsonSerializer.Serialize(payload));
            return action();
        }

        public Task<ContractRecord?> FindAsync(Actor actor, string code, CancellationToken ct)
        {
            Calls.Add("find");
            return Task.FromResult(Current);
        }

        public Task<bool> HasPendingCancellationAsync(Guid contractId, CancellationToken ct)
        {
            Calls.Add("pending");
            return Task.FromResult(PendingCancellation);
        }

        public Task<IReadOnlyList<string>> InactiveAreaItemsAsync(Guid contractId, CancellationToken ct)
        {
            Calls.Add("areas");
            return Task.FromResult(InactiveAreas);
        }

        public Task<SalesReviewer?> FindSalesReviewerAsync(Guid contractId, CancellationToken ct)
        {
            Calls.Add("reviewer");
            return Task.FromResult(Reviewer);
        }

        public Task<bool> TryMarkSubmittedAsync(Guid contractId, string status, int version, CancellationToken ct)
        {
            Calls.Add("mark");
            return Task.FromResult(MarkResults.Count == 0 || MarkResults.Dequeue());
        }

        public Task<int> StartRoundAsync(Guid contractId, Guid submittedBy, Guid reviewerId, CancellationToken ct)
        {
            Calls.Add("round");
            return Task.FromResult(RoundNo);
        }

        public Task NotifyAsync(Guid recipientId, Guid contractId, string content, CancellationToken ct)
        {
            Calls.Add("notify");
            Notification = (recipientId, content);
            return Task.CompletedTask;
        }

        public Task AuditAsync(Guid contractId, string action, Guid actorId, string? beforeStatus, string afterStatus,
            JsonObject? before, JsonObject after, string? note, CancellationToken ct)
        {
            Calls.Add("audit");
            Audit = (action, beforeStatus, afterStatus, note, after);
            return Task.CompletedTask;
        }
    }
}
