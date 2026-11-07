using QTKD.Application.Common.Interfaces;
using QTKD.Application.Features.ContractApprovals;
using QTKD.Domain.Contracts;
using Xunit;

namespace QTKD.UnitTests.ContractApprovals;

// ApprovalAssignmentService with a fake repository: permission, department scope, E2/E3/E6 and notifications.
public sealed class ApprovalAssignmentServiceTests
{
    private readonly Actor legalHead = new(Guid.NewGuid(), "LegalManager", Guid.NewGuid(), "TP PC");
    private readonly FakeRepository repository = new();
    private ApprovalAssignmentService Service() => new(repository);

    public ApprovalAssignmentServiceTests()
    {
        repository.Assigners.Add(legalHead.Id);
        repository.Managed[legalHead.Id] = ["PC"];
        repository.Document = AssignmentRulesTests.Document("KD", ("done", "approve", true), ("unassigned", null, false), ("waiting", null, false));
    }

    private AssignReviewRequest Request(string step, Guid assignee) =>
        new(repository.Document.RoundId, repository.Document.Steps.Single(s => s.Key == step).Id, repository.Document.Version, assignee);

    [Fact]
    public async Task Board_lists_only_steps_of_the_departments_the_actor_manages()
    {
        var items = await Service().Board(legalHead, default);
        Assert.Equal(["legal"], Assert.Single(items).ManagedSteps);
    }

    [Fact]
    public async Task Without_approvals_assign_or_outside_the_department_is_forbidden()
    {
        repository.Assigners.Clear();
        Assert.Equal("FORBIDDEN", (await Assert.ThrowsAsync<BusinessException>(() => Service().Board(legalHead, default))).Code);

        repository.Assigners.Add(legalHead.Id);
        var board = await Assert.ThrowsAsync<BusinessException>(() => Service().Assign(legalHead, repository.Document.Id, Request("board", Guid.NewGuid()), default));
        Assert.Equal(("FORBIDDEN", 403), (board.Code, board.Status));
        Assert.Empty(repository.Updates);
    }

    [Fact]
    public async Task Sales_step_is_not_assignable()
    {
        var candidates = await Assert.ThrowsAsync<BusinessException>(() => Service().Candidates(legalHead, repository.Document.Id, "sales", default));
        Assert.Equal(("VALIDATION", 400), (candidates.Code, candidates.Status));
        var assign = await Assert.ThrowsAsync<BusinessException>(() => Service().Assign(legalHead, repository.Document.Id, Request("sales", Guid.NewGuid()), default));
        Assert.Equal("FORBIDDEN", assign.Code);
        Assert.Empty(repository.Updates);
    }

    [Fact]
    public async Task Invalid_candidate_is_rejected_and_nothing_is_written()
    {
        var error = await Assert.ThrowsAsync<BusinessException>(() => Service().Assign(legalHead, repository.Document.Id, Request("legal", Guid.NewGuid()), default));
        Assert.Equal(("INVALID_ASSIGNEE", 400), (error.Code, error.Status));
        Assert.Empty(repository.Updates);
        Assert.Empty(repository.Notified);
    }

    [Fact]
    public async Task Assign_once_then_reject_same_or_different_person_without_duplicate_notifications()
    {
        var first = Guid.NewGuid(); var second = Guid.NewGuid();
        repository.Candidates.AddRange([first, second]);
        await Service().Assign(legalHead, repository.Document.Id, Request("legal", first), default);
        Assert.Equal((first, "Pending"), (repository.Updates.Single().Assignee, repository.Updates.Single().Status));
        repository.SetAssignee("legal", first, "pending-accept");
        foreach (var target in new[] { first, second })
            Assert.Equal("ASSIGNMENT_IMMUTABLE", (await Assert.ThrowsAsync<BusinessException>(() => Service().Assign(legalHead, repository.Document.Id, Request("legal", target), default))).Code);
        Assert.Equal([first], repository.Notified);
        Assert.Equal(["APPROVER_ASSIGNED"], repository.Audits);
    }

    [Fact]
    public async Task Future_steps_are_hidden_and_cannot_be_assigned_or_list_candidates()
    {
        repository.Document = repository.Document with { Steps = repository.Document.Steps.Select(s => s.Key == "sales" ? s with { State = "reviewing", Decision = null } : s).ToArray() };
        Assert.Empty(await Service().Board(legalHead, default));
        Assert.Equal("ASSIGNMENT_IMMUTABLE", (await Assert.ThrowsAsync<BusinessException>(() => Service().Candidates(legalHead, repository.Document.Id, "legal", default))).Code);
        Assert.Equal("ASSIGNMENT_IMMUTABLE", (await Assert.ThrowsAsync<BusinessException>(() => Service().Assign(legalHead, repository.Document.Id, Request("legal", Guid.NewGuid()), default))).Code);
        Assert.Empty(repository.Updates);
    }

    [Fact]
    public async Task Concurrent_assignments_have_one_winner_and_one_notification()
    {
        var people = new[] { Guid.NewGuid(), Guid.NewGuid() };
        repository.Candidates.AddRange(people);
        var results = await Task.WhenAll(people.Select(async person =>
        {
            try { await Service().Assign(legalHead, repository.Document.Id, Request("legal", person), default); return true; }
            catch (BusinessException e) when (e.Code == "ASSIGNMENT_IMMUTABLE") { return false; }
        }));
        Assert.Single(results, success => success);
        Assert.Single(repository.Updates); Assert.Single(repository.Notified); Assert.Single(repository.Audits);
    }

    [Fact]
    public async Task Started_step_or_changed_version_cannot_be_assigned()
    {
        repository.Candidates.Add(legalHead.Id);
        repository.SetAssignee("legal", Guid.NewGuid(), "reviewing");
        var started = await Assert.ThrowsAsync<BusinessException>(() => Service().Assign(legalHead, repository.Document.Id, Request("legal", legalHead.Id), default));
        Assert.Equal("ASSIGNMENT_IMMUTABLE", started.Code);

        var stale = Request("legal", legalHead.Id) with { ViewedVersion = repository.Document.Version + 1 };
        var version = await Assert.ThrowsAsync<BusinessException>(() => Service().Assign(legalHead, repository.Document.Id, stale, default));
        Assert.Equal("VERSION_MISMATCH", version.Code);
        Assert.Empty(repository.Updates);
    }

    private sealed class FakeRepository : IApprovalAssignmentRepository
    {
        private readonly SemaphoreSlim mutex = new(1, 1);
        public HashSet<Guid> Assigners { get; } = [];
        public Dictionary<Guid, HashSet<string>> Managed { get; } = [];
        public List<Guid> Candidates { get; } = [];
        public ReviewDocument Document { get; set; } = null!;
        public List<(Guid Step, Guid Assignee, string Status)> Updates { get; } = [];
        public List<Guid> Notified { get; } = [];
        public List<string> Audits { get; } = [];

        public void SetAssignee(string step, Guid assignee, string state) =>
            Document = Document with
            {
                Steps = Document.Steps.Select(s => s.Key == step ? s with { AssigneeId = assignee, State = state } : s).ToArray()
            };

        public Task<bool> IsAssignerAsync(Guid actorId, CancellationToken ct) => Task.FromResult(Assigners.Contains(actorId));

        public Task<IReadOnlySet<string>> ManagedDepartmentsAsync(Guid actorId, CancellationToken ct) =>
            Task.FromResult<IReadOnlySet<string>>(Managed.GetValueOrDefault(actorId) ?? []);

        public Task<IReadOnlyDictionary<string, string>> RoleDepartmentsAsync(CancellationToken ct) =>
            Task.FromResult(AssignmentRulesTests.RoleDepartments);

        public Task<IReadOnlyList<Guid>> RunningContractIdsAsync(CancellationToken ct) =>
            Task.FromResult<IReadOnlyList<Guid>>([Document.Id]);

        public Task<AssignmentDocument?> LoadAsync(Guid contractId, CancellationToken ct) =>
            Task.FromResult(contractId == Document.Id ? new AssignmentDocument(Document, Guid.NewGuid()) : null);

        public Task<IReadOnlyList<AssignmentCandidate>> FindCandidatesAsync(CandidateQuery query, CancellationToken ct) =>
            Task.FromResult<IReadOnlyList<AssignmentCandidate>>(Candidates
                .Where(c => query.Candidate is null || c == query.Candidate)
                .Select(c => new AssignmentCandidate(c, "Người duyệt", "Nhân viên", "Pháp chế"))
                .ToList());

        public async Task<T> InLockedContractAsync<T>(Guid contractId, Func<Task<T>> action, CancellationToken ct)
        {
            await mutex.WaitAsync(ct);
            try { await Task.Yield(); return await action(); }
            finally { mutex.Release(); }
        }

        public Task<bool> TryUpdateStepAsync(Guid stepId, Guid assigneeId, string status, CancellationToken ct)
        {
            if (Document.Steps.Single(s => s.Id == stepId).AssigneeId is not null) return Task.FromResult(false);
            Updates.Add((stepId, assigneeId, status));
            Document = Document with { Steps = Document.Steps.Select(s => s.Id == stepId ? s with { AssigneeId = assigneeId, State = "pending-accept" } : s).ToArray() };
            return Task.FromResult(true);
        }

        public Task NotifyAsync(Guid recipientId, Guid contractId, string content, CancellationToken ct)
        {
            Notified.Add(recipientId);
            return Task.CompletedTask;
        }

        public Task AuditAsync(Guid contractId, string action, Guid actorId, string before, string after, CancellationToken ct)
        {
            Audits.Add(action);
            return Task.CompletedTask;
        }
    }
}
