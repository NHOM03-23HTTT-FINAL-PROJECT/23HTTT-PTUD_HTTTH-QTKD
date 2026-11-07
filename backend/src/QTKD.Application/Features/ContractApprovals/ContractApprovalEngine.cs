using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using QTKD.Application.Features.Workflows;
using QTKD.Domain.Notifications;

namespace QTKD.Application.Features.ContractApprovals;

public sealed class ContractApprovalEngine(IApprovalStore store, WorkflowEngine workflow, TimeProvider clock) : IContractApprovalEngine
{
    public Task<IReadOnlyList<ReviewDocument>> Inbox(ReviewActor actor, string step, bool done, CancellationToken ct) => store.Inbox(actor, step, done, ct);
    public Task<ReviewDocument?> Read(Guid id, ReviewActor actor, CancellationToken ct) => store.Read(id, ct);
    public Task<ReviewOutcome> Execute(ReviewCommand command, CancellationToken ct) => store.Locked(command.DocumentId, async tx =>
    {
        if (command.Action is not ("accept" or "handoff" or "approve" or "revision" or "reject")
            || (command.Action is "approve" or "revision" or "reject"
                && (string.IsNullOrWhiteSpace(command.Comment) || command.Comment.Length > 4000))) throw new ReviewFailure(400, "VALIDATION");
        await tx.AssertActor(command.Actor, ct);
        if (!ContractApprovalService.InScope(command.Actor, tx.Document)) throw new ReviewFailure(403, "FORBIDDEN");
        var fingerprint = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(JsonSerializer.Serialize(command with { IdempotencyKey = "" }))));
        var receipt = await tx.Receipt(command.Actor.Id, command.IdempotencyKey, ct);
        if (receipt is not null)
        {
            if (receipt.Fingerprint != fingerprint) throw new ReviewFailure(409, "IDEMPOTENCY_CONFLICT");
            return receipt.Outcome;
        }
        var document = tx.Document;
        ContractApprovalService.Validate(command.Actor, document, command.Expected, command.Action == "accept", command.Action == "handoff");
        var state = new WorkflowState(document.RoundResult, document.Steps.Select(s => new WorkflowTask(s.Id, s.Order, s.AssigneeId, s.State, s.Decision, s.RequiresHandoff, RequiresAcceptance: true)).ToArray());
        WorkflowState result;
        try
        {
            result = workflow.Apply(state, command.Expected.StepId, command.Actor.Id, command.Action);
            // One user confirmation, one transaction and receipt; both transitions still belong to the shared engine.
            if (command.Expected.Step == "legal" && command.Action == "approve"
                && state.Tasks.Single(s => s.Id == command.Expected.StepId).RequiresHandoff)
                result = workflow.Apply(result, command.Expected.StepId, command.Actor.Id, "handoff");
        }
        catch (UnauthorizedAccessException e) { throw new ReviewFailure(403, e.Message); }
        catch (InvalidOperationException e) { throw new ReviewFailure(409, e.Message); }
        var now = clock.GetUtcNow().UtcDateTime;
        var steps = document.Steps.Select(s =>
        {
            var updated = result.Tasks.Single(t => t.Id == s.Id);
            var decided = s.State != "done" && updated.State == "done";
            return s with { State = updated.State, Decision = updated.Decision,
                ReviewedVersion = decided ? document.SubmittedVersion : s.ReviewedVersion,
                Comment = decided ? command.Comment : s.Comment, DecidedAt = decided ? now : s.DecidedAt };
        }).ToArray();
        var pending = steps.Any(s => s.State == "unassigned") && result.Result == "in-progress"
            ? "Bước tiếp theo đang chờ trưởng bộ phận phân công; không bỏ qua bước duyệt." : null;
        var next = document with { Steps = steps, RoundResult = result.Result, PendingTask = pending,
            Status = result.Result switch { "completed" => "approved", "revision" => "revision-requested", "rejected" => "rejected", _ => "under-review" } };
        var recipients = steps.Where(s => s.State is "reviewing" or "pending-accept" && s.AssigneeId != command.Actor.Id && document.Steps.Single(old => old.Id == s.Id).State != s.State)
            .Select(s => s.AssigneeId!.Value).ToList();
        var assignmentMessages = new List<ApprovalMessage>();
        foreach (var step in steps.Where(s => s.State == "unassigned" && document.Steps.Single(old => old.Id == s.Id).State != "unassigned"))
            foreach (var manager in await tx.AssignmentManagers(step.Key, ct))
                assignmentMessages.Add(new(manager, NotificationKinds.AssignmentRequired(AssignmentRules.StepLabel(step.Key), document.Title)));
        if (result.Result != "in-progress")
        {
            recipients.Add(tx.OwnerId);
            if (result.Result != "completed") recipients.AddRange(steps.Where(s => s.Key == "sales" && s.AssigneeId.HasValue).Select(s => s.AssigneeId!.Value));
        }
        if (recipients.Count > 0 || assignmentMessages.Count > 0) next = next with { PendingTask = string.Join(" ", new[] { pending, "Thông báo đang chờ gửi; kết quả duyệt đã được lưu." }.Where(s => s is not null)) };
        await tx.Save(command, next, fingerprint, recipients.Distinct().Select(id => new ApprovalMessage(id,
            NotificationKinds.Decision(document.Title, next.Status, command.Comment))).Concat(assignmentMessages).ToArray(), ct);
        return new ReviewOutcome(next, next.PendingTask);
    }, ct);
    public async Task<ReviewOutcome> RetryPending(Guid id, ReviewActor actor, string key, CancellationToken ct)
    {
        await store.Locked(id, async tx => { await tx.AssertActor(actor, ct); if (!ContractApprovalService.InScope(actor, tx.Document)) throw new ReviewFailure(403, "FORBIDDEN"); return true; }, ct);
        await store.RetryNotifications(id, ct);
        var document = await store.Read(id, ct) ?? throw new ReviewFailure(404, "NOT_FOUND");
        return new(document, document.PendingTask);
    }
}
