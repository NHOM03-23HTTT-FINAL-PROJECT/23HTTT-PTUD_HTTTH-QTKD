using QTKD.Application.Features.ContractApprovals;
using QTKD.Application.Features.Workflows;
using Xunit;

namespace QTKD.IntegrationTests;

public sealed class WorkflowEngineTests
{
    internal static ReviewDocument Submitted()
    {
        var keys = new[] { "sales", "legal", "board" };
        return new(Guid.NewGuid(), "Workflow contract", "Customer", "Owner", "KD", 1500, "submitted", 3,
            Guid.NewGuid(), 1, 3, "in-progress", DateTime.UtcNow,
            keys.Select((key, i) => new ReviewStep(Guid.NewGuid(), key, i + 1, Guid.NewGuid(), key,
                i == 0 ? "pending-accept" : "waiting", null, null, null, null, key == "legal")).ToArray(), "Terms", "Payment", []);
    }
    internal static ReviewCommand Command(ReviewDocument d, string step, string action, string? key = null)
    {
        var task = d.Steps.Single(s => s.Key == step);
        return new(d.Id, new(task.AssigneeId!.Value, step switch { "sales" => "TP_KD", "legal" => "NV_PC", _ => "GD" }, step switch { "legal" => "PC", "board" => "BGD", _ => "KD" }, ContractApprovalService.Permission(step)),
            new(d.RoundId, task.Id, d.Version, step), action, action is "accept" or "handoff" ? null : "Mandatory review conclusion", key ?? Guid.NewGuid().ToString());
    }
    private static ContractApprovalEngine Engine(MemoryApprovalStore store) => new(store, new(), TimeProvider.System);
    [Fact]
    public async Task Three_level_flow_requires_accept_and_explicit_legal_handoff_before_final_approval()
    {
        var store = new MemoryApprovalStore(Submitted()); var engine = Engine(store);
        await engine.Execute(Command(store.Document, "sales", "accept"), default);
        Assert.Equal("under-review", store.Document.Status);
        await engine.Execute(Command(store.Document, "sales", "approve"), default);
        Assert.Equal("reviewing", store.Document.Steps[1].State);
        Assert.Equal("under-review", store.Document.Status);
        await engine.Execute(Command(store.Document, "legal", "approve"), default);
        Assert.Equal("waiting", store.Document.Steps[2].State);
        var error = await Assert.ThrowsAsync<ReviewFailure>(() => engine.Execute(Command(store.Document, "board", "approve"), default));
        Assert.Equal("STEP_NOT_READY", error.Code);
        await engine.Execute(Command(store.Document, "legal", "handoff"), default);
        await engine.Execute(Command(store.Document, "board", "approve"), default);
        Assert.Equal("approved", store.Document.Status); Assert.Equal("completed", store.Document.RoundResult);
        Assert.All(store.Document.Steps, s => { Assert.Equal("approve", s.Decision); Assert.Equal(3, s.ReviewedVersion); Assert.NotNull(s.DecidedAt); });
        Assert.Equal(5, store.Audit.Count); Assert.NotEmpty(store.Messages);
    }
    [Theory]
    [InlineData("sales", "revision", "revision-requested")]
    [InlineData("legal", "revision", "revision-requested")]
    [InlineData("board", "revision", "revision-requested")]
    [InlineData("sales", "reject", "rejected")]
    [InlineData("legal", "reject", "rejected")]
    [InlineData("board", "reject", "rejected")]
    public async Task Revision_and_rejection_end_round_without_processing_later_steps(string step, string action, string expected)
    {
        var store = new MemoryApprovalStore(Submitted()); var engine = Engine(store);
        await engine.Execute(Command(store.Document, "sales", "accept"), default);
        if (step != "sales") await engine.Execute(Command(store.Document, "sales", "approve"), default);
        if (step == "board")
        {
            await engine.Execute(Command(store.Document, "legal", "approve"), default);
            await engine.Execute(Command(store.Document, "legal", "handoff"), default);
        }
        await engine.Execute(Command(store.Document, step, action), default);
        Assert.Equal(expected, store.Document.Status);
        Assert.DoesNotContain(store.Document.Steps, s => s.State == "reviewing");
        var count = store.Audit.Count;
        await Assert.ThrowsAsync<ReviewFailure>(() => engine.Execute(Command(store.Document, step, "approve"), default));
        Assert.Equal(count, store.Audit.Count);
    }
    [Fact]
    public async Task Concurrent_distinct_decisions_have_only_one_effect_and_replay_does_not_duplicate_audit_or_notifications()
    {
        var store = new MemoryApprovalStore(Submitted()); var engine = Engine(store);
        await engine.Execute(Command(store.Document, "sales", "accept"), default);
        var approve = Command(store.Document, "sales", "approve", "same-request");
        var reject = Command(store.Document, "sales", "reject");
        var results = await Task.WhenAll(new[] { approve, reject }.Select(async command =>
        {
            try { await engine.Execute(command, default); return true; } catch (ReviewFailure) { return false; }
        }));
        Assert.Equal(1, results.Count(x => x)); Assert.Equal(2, store.Audit.Count);
        var winner = store.Audit.Last(); var messages = store.Messages.Count;
        await engine.Execute(winner, default);
        Assert.Equal(2, store.Audit.Count); Assert.Equal(messages, store.Messages.Count);
        var error = await Assert.ThrowsAsync<ReviewFailure>(() => engine.Execute(winner with { Comment = "Different payload" }, default));
        Assert.Equal("IDEMPOTENCY_CONFLICT", error.Code);
    }
    [Fact]
    public async Task Save_failure_rolls_back_source_decision_history_and_messages()
    {
        var store = new MemoryApprovalStore(Submitted()); var engine = Engine(store);
        await engine.Execute(Command(store.Document, "sales", "accept"), default);
        var before = store.Document; store.FailSave = true;
        await Assert.ThrowsAsync<IOException>(() => engine.Execute(Command(store.Document, "sales", "approve"), default));
        Assert.Equal(before, store.Document); Assert.Single(store.Audit); Assert.Empty(store.Messages);
    }
    [Fact]
    public async Task Missing_board_assignee_retains_legal_conclusion_and_never_skips_to_approved()
    {
        var initial = Submitted(); initial = initial with { Steps = [initial.Steps[0], initial.Steps[1], initial.Steps[2] with { AssigneeId = null, AssigneeName = null }] };
        var store = new MemoryApprovalStore(initial); var engine = Engine(store);
        await engine.Execute(Command(store.Document, "sales", "accept"), default);
        await engine.Execute(Command(store.Document, "sales", "approve"), default);
        await engine.Execute(Command(store.Document, "legal", "approve"), default);
        await engine.Execute(Command(store.Document, "legal", "handoff"), default);
        Assert.Equal("approve", store.Document.Steps[1].Decision); Assert.Equal("unassigned", store.Document.Steps[2].State);
        Assert.Equal("under-review", store.Document.Status); Assert.Equal("in-progress", store.Document.RoundResult);
    }
    [Fact]
    public async Task Notification_retry_failure_does_not_undo_approved_contract_or_repeat_decisions()
    {
        var store = new MemoryApprovalStore(Submitted()); var engine = Engine(store);
        foreach (var (step, action) in new[] { ("sales", "accept"), ("sales", "approve"), ("legal", "approve"), ("legal", "handoff"), ("board", "approve") })
            await engine.Execute(Command(store.Document, step, action), default);
        var actor = Command(store.Document, "board", "approve").Actor;
        store.FailDelivery = true;
        await Assert.ThrowsAsync<IOException>(() => engine.RetryPending(store.Document.Id, actor, "retry", default));
        Assert.Equal("approved", store.Document.Status); Assert.Equal(5, store.Audit.Count); Assert.NotEmpty(store.Messages);
        store.FailDelivery = false;
        await engine.RetryPending(store.Document.Id, actor, "retry", default);
        Assert.Equal("approved", store.Document.Status); Assert.Equal(5, store.Audit.Count); Assert.Empty(store.Messages);
    }
    [Fact]
    public void Generic_workflow_is_not_fixed_to_three_contract_roles()
    {
        var tasks = Enumerable.Range(1, 5).Select(i => new WorkflowTask(Guid.NewGuid(), i, Guid.NewGuid(), i == 1 ? "reviewing" : "waiting", null, false)).ToArray();
        var state = new WorkflowState("in-progress", tasks); var engine = new WorkflowEngine();
        foreach (var task in tasks) state = engine.Apply(state, task.Id, task.AssigneeId!.Value, "approve");
        Assert.Equal("completed", state.Result); Assert.All(state.Tasks, t => Assert.Equal("done", t.State));
    }
    [Fact]
    public async Task Incoming_resubmission_requires_a_new_round_and_restarts_at_sales_without_reusing_old_decisions()
    {
        var store = new MemoryApprovalStore(Submitted()); var engine = Engine(store);
        await engine.Execute(Command(store.Document, "sales", "accept"), default);
        await engine.Execute(Command(store.Document, "sales", "approve"), default);
        var oldCommand = Command(store.Document, "legal", "approve");
        await engine.Execute(Command(store.Document, "legal", "revision"), default);
        var oldAudit = store.Audit.ToArray();
        // The contract submission module supplies the next pinned round; this module does not edit contracts or submit them.
        var incoming = Submitted();
        store.Document = incoming with { Id = store.Document.Id, RoundNo = 2, Version = 4, SubmittedVersion = 4,
            Steps = incoming.Steps.Select((s, i) => s with { AssigneeId = store.Document.Steps[i].AssigneeId }).ToArray() };
        var stale = await Assert.ThrowsAsync<ReviewFailure>(() => engine.Execute(oldCommand, default));
        Assert.Equal("STEP_DONE", stale.Code);
        await engine.Execute(Command(store.Document, "sales", "accept"), default);
        Assert.Equal("reviewing", store.Document.Steps[0].State);
        Assert.Null(store.Document.Steps[1].Decision);
        Assert.Equal(oldAudit, store.Audit.Take(oldAudit.Length).ToArray());
    }
}

/// <summary>Transactional test storage only. Production uses row locks and a PostgreSQL transaction.</summary>
internal sealed class MemoryApprovalStore(ReviewDocument initial) : IApprovalStore
{
    private readonly SemaphoreSlim mutex = new(1, 1);
    public ReviewDocument Document = initial;
    public List<ReviewCommand> Audit = [];
    public List<ApprovalMessage> Messages = [];
    public Dictionary<(Guid, string), ApprovalReceipt> Receipts = [];
    public bool FailSave, FailDelivery;
    public Task<IReadOnlyList<ReviewDocument>> Inbox(ReviewActor actor, string step, bool done, CancellationToken ct) => Task.FromResult<IReadOnlyList<ReviewDocument>>([Document]);
    public Task<ReviewDocument?> Read(Guid id, CancellationToken ct) => Task.FromResult<ReviewDocument?>(Document.Id == id ? Document : null);
    public async Task<T> Locked<T>(Guid id, Func<IApprovalTransaction, Task<T>> action, CancellationToken ct)
    {
        await mutex.WaitAsync(ct);
        await Task.Yield(); // Let competing callers arrive while this transaction holds the lock.
        try
        {
            var tx = new MemoryTransaction(this, Document); var result = await action(tx);
            if (tx.Saved is not null)
            {
                if (FailSave) throw new IOException("Injected save failure");
                Document = tx.Saved; Audit.Add(tx.Command!); Messages.AddRange(tx.Messages);
                Receipts[(tx.Command!.Actor.Id, tx.Command.IdempotencyKey)] = new(tx.Fingerprint!, new(Document, Document.PendingTask));
            }
            return result;
        }
        finally { mutex.Release(); }
    }
    public Task RetryNotifications(Guid id, CancellationToken ct)
    {
        if (FailDelivery) throw new IOException("Injected delivery failure");
        Messages.Clear(); Document = Document with { PendingTask = null }; return Task.CompletedTask;
    }
    private sealed class MemoryTransaction(MemoryApprovalStore store, ReviewDocument document) : IApprovalTransaction
    {
        public ReviewDocument Document => document;
        public Guid OwnerId => Guid.Parse("00000000-0000-0000-0000-000000000001");
        public ReviewDocument? Saved; public ReviewCommand? Command; public string? Fingerprint;
        public IReadOnlyList<ApprovalMessage> Messages = [];
        public Task AssertActor(ReviewActor actor, CancellationToken ct) => Task.CompletedTask;
        public Task<ApprovalReceipt?> Receipt(Guid actorId, string key, CancellationToken ct) => Task.FromResult(store.Receipts.GetValueOrDefault((actorId, key)));
        public Task Save(ReviewCommand command, ReviewDocument next, string fingerprint, IReadOnlyList<ApprovalMessage> messages, CancellationToken ct)
        { Saved = next; Command = command; Fingerprint = fingerprint; Messages = messages; return Task.CompletedTask; }
    }
}
