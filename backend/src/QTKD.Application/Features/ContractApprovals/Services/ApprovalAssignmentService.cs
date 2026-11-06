using System.Text.Json;
using QTKD.Application.Common.Interfaces;
using QTKD.Domain.Contracts;
using QTKD.Domain.Notifications;

namespace QTKD.Application.Features.ContractApprovals;

public sealed class ApprovalAssignmentService(IApprovalAssignmentRepository repository)
{
    public async Task<IReadOnlyList<AssignmentItem>> Board(Actor actor, CancellationToken ct)
    {
        await RequireAssigner(actor, ct);
        var managed = await repository.ManagedDepartmentsAsync(actor.Id, ct);
        if (managed.Count == 0) return [];
        var roleDepartments = await repository.RoleDepartmentsAsync(ct);

        var items = new List<AssignmentItem>();
        foreach (var id in await repository.RunningContractIdsAsync(ct))
        {
            var loaded = await repository.LoadAsync(id, ct);
            if (loaded is null) continue;
            var steps = AssignmentRules.ManagedSteps(loaded.Document, managed, roleDepartments);
            if (steps.Count > 0) items.Add(new(loaded.Document, steps));
        }
        return items;
    }

    public async Task<IReadOnlyList<AssignmentCandidate>> Candidates(Actor actor, Guid id, string step, CancellationToken ct)
    {
        ApprovalAssignmentValidator.Step(step);
        await RequireAssigner(actor, ct);
        var loaded = await repository.LoadAsync(id, ct) ?? throw new BusinessException("NOT_FOUND", 404);
        await RequireManages(actor, step, ct);
        return await repository.FindCandidatesAsync(Query(loaded, step, null), ct);
    }

    public Task<ReviewDocument> Assign(Actor actor, Guid id, AssignReviewRequest request, CancellationToken ct)
    {
        ApprovalAssignmentValidator.Assign(request);
        return repository.InLockedContractAsync(id, () => AssignIn(actor, id, request, ct), ct);
    }

    private async Task<ReviewDocument> AssignIn(Actor actor, Guid id, AssignReviewRequest request, CancellationToken ct)
    {
        await RequireAssigner(actor, ct);
        var loaded = await repository.LoadAsync(id, ct) ?? throw new BusinessException("NOT_FOUND", 404);
        var document = loaded.Document;
        if (document.RoundId != request.RoundId || document.RoundResult != "in-progress") throw new BusinessException("STEP_DONE", 409);
        if (document.Version != request.ViewedVersion || document.Version != document.SubmittedVersion) throw new BusinessException("VERSION_MISMATCH", 409);
        var step = document.Steps.SingleOrDefault(s => s.Id == request.StepId) ?? throw new BusinessException("NOT_FOUND", 404);
        if (!AssignmentRules.StepKeys.Contains(step.Key)) throw new BusinessException("FORBIDDEN", 403);
        await RequireManages(actor, step.Key, ct);

        if (step.AssigneeId == request.AssigneeId) return document;
        if (!AssignmentRules.CanAssign(document, step)) throw new BusinessException("ASSIGNMENT_IMMUTABLE", 409);
        if ((await repository.FindCandidatesAsync(Query(loaded, step.Key, request.AssigneeId), ct)).Count == 0)
            throw new BusinessException("INVALID_ASSIGNEE", 400);

        var activates = AssignmentRules.ActivatesOnAssign(document, step);
        if (!await repository.TryUpdateStepAsync(step.Id, request.AssigneeId, AssignmentRules.StatusAfterAssign(activates), ct))
            throw new BusinessException("ASSIGNMENT_IMMUTABLE", 409);

        var label = AssignmentRules.StepLabel(step.Key);
        await repository.NotifyAsync(request.AssigneeId, id, NotificationKinds.Assigned(label, document.Title), ct);
        if (step.AssigneeId is { } previous)
            await repository.NotifyAsync(previous, id, NotificationKinds.Revoked(label, document.Title), ct);

        await repository.AuditAsync(id, step.AssigneeId is null ? "APPROVER_ASSIGNED" : "APPROVER_REASSIGNED", actor.Id,
            JsonSerializer.Serialize(new { stepId = step.Id, step = step.Key, assigneeId = step.AssigneeId }),
            JsonSerializer.Serialize(new { stepId = step.Id, step = step.Key, assigneeId = request.AssigneeId, activated = activates }), ct);

        return (await repository.LoadAsync(id, ct))!.Document;
    }

    private async Task RequireAssigner(Actor actor, CancellationToken ct)
    {
        if (!await repository.IsAssignerAsync(actor.Id, ct)) throw new BusinessException("FORBIDDEN", 403);
    }

    private async Task RequireManages(Actor actor, string step, CancellationToken ct)
    {
        var managed = await repository.ManagedDepartmentsAsync(actor.Id, ct);
        if (!managed.Contains(AssignmentRules.StepDepartment(step, await repository.RoleDepartmentsAsync(ct))))
            throw new BusinessException("FORBIDDEN", 403);
    }

    private static CandidateQuery Query(AssignmentDocument loaded, string step, Guid? candidate) =>
        new(AssignmentRules.StepRoles(step), ContractApprovalService.Permission(step), loaded.OwnerId, candidate);
}
