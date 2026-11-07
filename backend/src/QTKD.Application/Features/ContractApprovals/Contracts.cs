namespace QTKD.Application.Features.ContractApprovals;

public sealed record ReviewActor(Guid Id, string Role, string Department, string Permission);
public sealed record ReviewStep(Guid Id, string Key, int Order, Guid? AssigneeId, string? AssigneeName,
    string State, string? Decision, int? ReviewedVersion, string? Comment, DateTime? DecidedAt,
    bool RequiresHandoff = false);
public sealed record ReviewDocument(Guid Id, string Title, string CustomerName, string OwnerName,
    string Department, decimal Value, string Status, int Version, Guid RoundId, int RoundNo,
    int SubmittedVersion, string RoundResult, DateTime SubmittedAt, IReadOnlyList<ReviewStep> Steps,
    string Content, string PaymentTerm, IReadOnlyList<ReviewAttachment> Attachments, string? PendingTask = null,
    string ContractType = "", DateOnly? StartDate = null, DateOnly? EndDate = null, IReadOnlyList<ReviewService>? Services = null,
    string Code = "");
public sealed record ReviewService(string Name, string Area, string Unit);
public sealed record ReviewCoordination(Guid Id, Guid DocumentId, Guid RoundId, string Department, string Content,
    string RequestedBy, DateTime RequestedAt, string? Reply = null, string? RepliedBy = null, DateTime? RepliedAt = null);
public sealed record CoordinationRequest(ReviewRequest Expected, string Department, string Content);
public sealed record ReviewAttachment(string Name, string Url);
public sealed record ReviewRequest(Guid RoundId, Guid StepId, int ViewedVersion, string Step);
public sealed record DecisionRequest(Guid RoundId, Guid StepId, int ViewedVersion, string Step,
    string Decision, string Comment);
public sealed record ReviewOutcome(ReviewDocument Document, string? PendingTask = null);
public sealed record ReviewCommand(Guid DocumentId, ReviewActor Actor, ReviewRequest Expected,
    string Action, string? Comment, string IdempotencyKey);

public sealed class ReviewFailure(int status, string code) : Exception(code)
{
    public int Status { get; } = status;
    public string Code { get; } = code;
}

/// <summary>
/// TV5 integration boundary; no state machine lives in the contract module.
/// Implementations must read the pinned round snapshot, filter inbox by actor/scope, and
/// revalidate role/permission/scope, assignee, order, source + reviewed versions and round status
/// inside the write transaction. Execute atomically persists the decision, source state,
/// append-only audit and durable pending deliveries. Idempotency keys are scoped by actor and
/// document; reuse with a different payload conflicts. RetryPending retries delivery only.
/// The contract module delegates all transitions to the shared WorkflowEngine through this adapter.
/// </summary>
public interface IContractApprovalEngine
{
    Task<IReadOnlyList<ReviewDocument>> Inbox(ReviewActor actor, string step, bool done, CancellationToken ct);
    Task<ReviewDocument?> Read(Guid documentId, ReviewActor actor, CancellationToken ct);
    Task<ReviewOutcome> Execute(ReviewCommand command, CancellationToken ct);
    Task<ReviewOutcome> RetryPending(Guid documentId, ReviewActor actor, string idempotencyKey, CancellationToken ct);
}

public sealed record ApprovalReceipt(string Fingerprint, ReviewOutcome Outcome);
public sealed record ApprovalMessage(Guid RecipientId, string Content);
public interface IApprovalTransaction
{
    ReviewDocument Document { get; }
    Guid OwnerId { get; }
    Task AssertActor(ReviewActor actor, CancellationToken ct);
    Task<IReadOnlyList<Guid>> AssignmentManagers(string step, CancellationToken ct) => Task.FromResult<IReadOnlyList<Guid>>([]);
    Task<ApprovalReceipt?> Receipt(Guid actorId, string key, CancellationToken ct);
    Task Save(ReviewCommand command, ReviewDocument next, string fingerprint, IReadOnlyList<ApprovalMessage> messages, CancellationToken ct);
}
public interface IApprovalStore
{
    Task<IReadOnlyList<ReviewDocument>> Inbox(ReviewActor actor, string step, bool done, CancellationToken ct);
    Task<ReviewDocument?> Read(Guid id, CancellationToken ct);
    Task<T> Locked<T>(Guid id, Func<IApprovalTransaction, Task<T>> action, CancellationToken ct);
    Task RetryNotifications(Guid id, CancellationToken ct);
}
