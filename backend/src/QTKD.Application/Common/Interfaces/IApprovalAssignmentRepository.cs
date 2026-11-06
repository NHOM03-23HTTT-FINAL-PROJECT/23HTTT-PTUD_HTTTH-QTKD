using QTKD.Application.Features.ContractApprovals;

namespace QTKD.Application.Common.Interfaces;

/// <summary>
/// Data access for SYS-CTR-10. Inside InLockedContractAsync the contract row is locked and the assigner/candidate
/// checks also lock the user and permission rows they read, so a concurrent revocation cannot slip through.
/// </summary>
public interface IApprovalAssignmentRepository
{
    /// <summary>Active account, no forced password change, role holds approvals.assign.</summary>
    Task<bool> IsAssignerAsync(Guid actorId, CancellationToken ct);

    /// <summary>Codes of departments whose manager_id is the actor.</summary>
    Task<IReadOnlySet<string>> ManagedDepartmentsAsync(Guid actorId, CancellationToken ct);

    /// <summary>Role code → department code (qtkd.role_definition).</summary>
    Task<IReadOnlyDictionary<string, string>> RoleDepartmentsAsync(CancellationToken ct);

    /// <summary>Contracts with a running approval round, oldest submission first.</summary>
    Task<IReadOnlyList<Guid>> RunningContractIdsAsync(CancellationToken ct);

    /// <summary>The contract with its latest round; null when it does not exist.</summary>
    Task<AssignmentDocument?> LoadAsync(Guid contractId, CancellationToken ct);

    /// <summary>
    /// Active users in one of the roles, whose role holds the permission, other than the owner.
    /// With Candidate set, returns at most that user.
    /// </summary>
    Task<IReadOnlyList<AssignmentCandidate>> FindCandidatesAsync(CandidateQuery query, CancellationToken ct);

    /// <summary>Runs the action in one transaction holding the contract row lock; 404 NOT_FOUND when the contract is missing.</summary>
    Task<T> InLockedContractAsync<T>(Guid contractId, Func<Task<T>> action, CancellationToken ct);

    /// <summary>Sets assignee and status while the step has no decision; false when it changed meanwhile.</summary>
    Task<bool> TryUpdateStepAsync(Guid stepId, Guid assigneeId, string status, CancellationToken ct);

    Task NotifyAsync(Guid recipientId, Guid contractId, string content, CancellationToken ct);

    Task AuditAsync(Guid contractId, string action, Guid actorId, string before, string after, CancellationToken ct);
}

public sealed record AssignmentDocument(ReviewDocument Document, Guid OwnerId);

public sealed record CandidateQuery(IReadOnlyList<string> Roles, string Permission, Guid OwnerId, Guid? Candidate = null);
