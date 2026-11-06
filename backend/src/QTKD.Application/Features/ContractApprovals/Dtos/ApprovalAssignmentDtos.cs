namespace QTKD.Application.Features.ContractApprovals;

public sealed record AssignReviewRequest(Guid RoundId, Guid StepId, int ViewedVersion, Guid AssigneeId);

public sealed record AssignmentItem(ReviewDocument Document, IReadOnlyList<string> ManagedSteps);

public sealed record AssignmentCandidate(Guid Id, string Name, string Title, string Department);
