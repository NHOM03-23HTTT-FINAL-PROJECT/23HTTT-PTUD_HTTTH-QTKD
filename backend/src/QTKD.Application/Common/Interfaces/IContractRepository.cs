using System.Text.Json.Nodes;
using QTKD.Domain.Contracts;

namespace QTKD.Application.Common.Interfaces;

/// <summary>
/// Data access for SYS-CTR-04 (trình duyệt hợp đồng) through EF Core. Methods called inside <see cref="IdempotentAsync"/>
/// share its transaction. Reads return records; ContractService turns them into the API response.
/// </summary>
public interface IContractRepository
{
    /// <summary>
    /// Runs <paramref name="action"/> once per actor/operation/key in one transaction. A repeated key with the same payload
    /// returns the stored response with replayed=true; a concurrent duplicate waits for the first one to finish.
    /// </summary>
    Task<JsonObject> IdempotentAsync(Actor actor, string operation, string key, object payload, Func<Task<JsonObject>> action, CancellationToken ct);

    /// <summary>The contract with everything the detail screen shows; null when it is outside the actor's scope.</summary>
    Task<ContractRecord?> FindAsync(Actor actor, string code, CancellationToken ct);

    Task<bool> HasPendingCancellationAsync(Guid contractId, CancellationToken ct);

    /// <summary>"Service · area" labels of items whose area, or any ancestor area, is no longer Active.</summary>
    Task<IReadOnlyList<string>> InactiveAreaItemsAsync(Guid contractId, CancellationToken ct);

    /// <summary>The Sales Manager of the owning department who may review step 1; null when there is none.</summary>
    Task<SalesReviewer?> FindSalesReviewerAsync(Guid contractId, CancellationToken ct);

    /// <summary>
    /// Sets the status to Submitted only while status and version are still the ones read; false when another transaction
    /// changed the contract first. Status changes keep the content version (202611030005).
    /// </summary>
    Task<bool> TryMarkSubmittedAsync(Guid contractId, string status, int version, CancellationToken ct);

    /// <summary>Creates the next approval round with its three steps, step 1 assigned to the reviewer; returns the round number.</summary>
    Task<int> StartRoundAsync(Guid contractId, Guid submittedBy, Guid reviewerId, CancellationToken ct);

    Task NotifyAsync(Guid recipientId, Guid contractId, string content, CancellationToken ct);

    Task AuditAsync(Guid contractId, string action, Guid actorId, string? beforeStatus, string afterStatus,
        JsonObject? before, JsonObject after, string? note, CancellationToken ct);
}

public sealed record SalesReviewer(Guid Id, string Name);

/// <summary>qtkd.contract with the names and child rows of the contract detail. Status uses the database labels.</summary>
public sealed record ContractRecord(
    Guid Id, string Code, string Title, string ContractType, string SourceMode, string? TemplateCode,
    DateOnly StartDate, DateOnly EndDate, decimal Value, string PaymentTerms, string Content, string Status,
    Guid OwnerId, string OwnerName, Guid? OwningDepartmentId, string CustomerCode, string CustomerName, string CustomerSnapshot,
    int Version, DateTime CreatedAt, DateTime UpdatedAt,
    IReadOnlyList<ContractItemRecord> Items,
    IReadOnlyList<ContractAttachmentRecord> Attachments,
    IReadOnlyList<ApprovalRoundRecord> Rounds,
    IReadOnlyList<CancellationRequestRecord> CancellationRequests,
    ContractCancellationRecord? Cancellation,
    ApprovalDecisionRecord? LastDecision,
    IReadOnlyList<ContractHistoryRecord> History);

public sealed record ContractItemRecord(Guid Id, string ServiceCode, string ServiceName, string Unit, bool RequiresArea, string? AreaCode, bool? AreaActive);

public sealed record ContractAttachmentRecord(Guid Id, string Name, long Size);

/// <summary>Snapshot is the JSON stored in approval_round.record_snapshot.</summary>
public sealed record ApprovalRoundRecord(
    Guid Id, int No, Guid SubmittedById, string SubmittedByName, DateTime SubmittedAt, int RecordVersion,
    string Snapshot, DateTime? EndedAt, string Result, IReadOnlyList<ApprovalStepRecord> Steps, IReadOnlyList<ApprovalLogRecord> Log);

/// <summary>One approval or assignment audit row of a round (SYS-CTR-11 bước 9). From/To are client statuses when recorded.</summary>
public sealed record ApprovalLogRecord(DateTime At, Guid? StepId, string Action, string? ActorName, string? From, string? To, string? Note);

public sealed record ApprovalStepRecord(
    Guid Id, int Order, string Label, Guid? AssigneeId, string? AssigneeName, string? AssigneeRole,
    DateTime? AssignedAt, DateTime? AcceptedAt, string Status, string? Decision, string? DecidedByName, DateTime? DecidedAt, string? Comment);

public sealed record CancellationRequestRecord(
    Guid Id, string Party, string Reason, string Status, string RequestedByName, DateTime RequestedAt, int Version,
    Guid SalesAssigneeId, string SalesAssigneeName, bool? SalesApproved, string? SalesReason, DateTime? SalesDecidedAt,
    Guid? BoardAssigneeId, string? BoardAssigneeName, bool? BoardApproved, string? BoardReason, DateTime? BoardDecidedAt,
    string? NotificationStatus);

public sealed record ContractCancellationRecord(string? ByName, DateTime At, string? Reason);

/// <summary>The latest Request revision or Reject decision of any round.</summary>
public sealed record ApprovalDecisionRecord(string StepLabel, string ByName, DateTime? At, string? Comment);

/// <summary>ValueAfter is the audit_log.value_after JSON; it carries the historical actor name.</summary>
public sealed record ContractHistoryRecord(DateTime At, string Action, string? ActorName, string? ValueAfter, string? Note, string? From, string? To);
