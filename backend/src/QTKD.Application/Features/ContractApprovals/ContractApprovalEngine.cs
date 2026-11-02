using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using QTKD.Application.Features.Workflows;

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
        var state = new WorkflowState(document.RoundResult, document.Steps.Select(s => new WorkflowTask(s.Id, s.Order, s.AssigneeId, s.State, s.Decision, s.RequiresHandoff)).ToArray());
        WorkflowState result;
        try { result = workflow.Apply(state, command.Expected.StepId, command.Actor.Id, command.Action); }
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
        var pending = steps.Any(s => s.State == "unassigned") ? "Bước tiếp theo đang chờ phân công; không bỏ qua bước duyệt."
            : steps.Any(s => s.State == "done" && s.RequiresHandoff) && steps.Any(s => s.State == "waiting") && result.Result == "in-progress"
                ? "Chờ người rà soát thực hiện bàn giao hồ sơ sang bước kế tiếp." : null;
        var next = document with { Steps = steps, RoundResult = result.Result, PendingTask = pending,
            Status = result.Result switch { "completed" => "approved", "revision" => "revision-requested", "rejected" => "rejected", _ => "under-review" } };
        var recipients = steps.Where(s => s.State == "reviewing" && s.AssigneeId != command.Actor.Id && document.Steps.Single(old => old.Id == s.Id).State != "reviewing")
            .Select(s => s.AssigneeId!.Value).ToList();
        if (result.Result != "in-progress")
        {
            recipients.Add(tx.OwnerId);
            if (result.Result != "completed") recipients.AddRange(steps.Where(s => s.Key == "sales" && s.AssigneeId.HasValue).Select(s => s.AssigneeId!.Value));
        }
        if (recipients.Count > 0) next = next with { PendingTask = string.Join(" ", new[] { pending, "Thông báo đang chờ gửi; kết quả duyệt đã được lưu." }.Where(s => s is not null)) };
        await tx.Save(command, next, fingerprint, recipients.Distinct().Select(id => new ApprovalMessage(id,
            $"Hồ sơ {document.Title}: {next.Status}. {command.Comment}")).ToArray(), ct);
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
