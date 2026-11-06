using QTKD.Domain.Contracts;

namespace QTKD.Application.Features.ContractApprovals;

public static class ApprovalAssignmentValidator
{
    public static void Step(string? step)
    {
        if (step is null || !AssignmentRules.StepKeys.Contains(step))
        {
            throw new BusinessException("VALIDATION", 400);
        }
    }

    public static void Assign(AssignReviewRequest? request)
    {
        if (request is null || request.RoundId == Guid.Empty || request.StepId == Guid.Empty || request.AssigneeId == Guid.Empty)
        {
            throw new BusinessException("VALIDATION", 400);
        }
    }
}
