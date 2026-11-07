using QTKD.Application.Features.Identity;

namespace QTKD.Application.Features.ContractApprovals;

public sealed class ContractApprovalService(IContractApprovalEngine engine, IIdentityService identity)
{
    public static string Permission(string step) => step switch
    {
        "sales" or "board" => "approvals.approve", "legal" => "approvals.review-legal",
        _ => throw new ReviewFailure(400, "VALIDATION")
    };

    public static IReadOnlyList<string> RoleCodes(string step) => step switch
    {
        "sales" => ["TP_KD"], "legal" => ["NV_PC", "TP_PC"], "board" => ["GD", "TGD"],
        _ => throw new ReviewFailure(400, "VALIDATION")
    };
    private async Task<ReviewActor> Actor(Guid id, string step, CancellationToken ct)
    {
        var permission = Permission(step);
        var user = await identity.User(id, ct);
        var role = user.Roles.FirstOrDefault(RoleCodes(step).Contains);
        if (user.Status != "Active" || user.MustChangePassword || role is null
            || !await identity.HasPermission(id, permission, ct)) throw new ReviewFailure(403, "FORBIDDEN");
        return new(id, role, user.Department, permission);
    }
    public static bool InScope(ReviewActor actor, ReviewDocument document) =>
        (actor.Role != "TP_KD" || actor.Department == document.Department)
        && document.Steps.Any(x => x.AssigneeId == actor.Id && RoleCodes(x.Key).Contains(actor.Role));

    public async Task<IReadOnlyList<ReviewDocument>> Inbox(Guid actorId, string step, bool done, CancellationToken ct)
    {
        var actor = await Actor(actorId, step, ct);
        var documents = await engine.Inbox(actor, step, done, ct);
        // Defense in depth: an engine adapter must never broaden the caller's inbox.
        return documents.Where(d => InScope(actor, d) && d.Steps.Any(s => s.Key == step && s.AssigneeId == actor.Id
            && (done ? s.State == "done" : d.RoundResult == "in-progress" && s.State is "pending-accept" or "reviewing"))).ToArray();
    }
    public async Task<ReviewDocument> Read(Guid actorId, Guid id, string step, CancellationToken ct)
    {
        var actor = await Actor(actorId, step, ct);
        return await ReadScoped(actor, id, ct);
    }
    private async Task<ReviewDocument> ReadScoped(ReviewActor actor, Guid id, CancellationToken ct)
    {
        var document = await engine.Read(id, actor, ct) ?? throw new ReviewFailure(404, "NOT_FOUND");
        if (!InScope(actor, document)) throw new ReviewFailure(403, "FORBIDDEN");
        return document;
    }
    public static void Validate(ReviewActor actor, ReviewDocument d, ReviewRequest request, bool accept, bool handoff = false)
    {
        if (!InScope(actor, d)) throw new ReviewFailure(403, "FORBIDDEN");
        if (request.RoundId != d.RoundId || d.RoundResult != "in-progress") throw new ReviewFailure(409, "STEP_DONE");
        if (request.ViewedVersion != d.Version || d.Version != d.SubmittedVersion) throw new ReviewFailure(409, "VERSION_MISMATCH");
        if (new[] { "sales", "legal", "board" }.Any(key => d.Steps.Count(s => s.Key == key) != 1)
            || d.Steps.Single(s => s.Key == "sales").Order >= d.Steps.Single(s => s.Key == "legal").Order
            || d.Steps.Single(s => s.Key == "legal").Order >= d.Steps.Single(s => s.Key == "board").Order
            || d.Steps.Max(s => s.Order) != d.Steps.Single(s => s.Key == "board").Order)
            throw new ReviewFailure(409, "STEP_NOT_READY");
        var step = d.Steps.SingleOrDefault(s => s.Id == request.StepId && s.Key == request.Step)
            ?? throw new ReviewFailure(409, "STEP_NOT_READY");
        if (step.AssigneeId != actor.Id) throw new ReviewFailure(403, "NOT_ASSIGNEE");
        var predecessors = step.Key switch { "legal" => new[] { "sales" }, "board" => new[] { "sales", "legal" }, _ => Array.Empty<string>() };
        if (predecessors.Any(key => !d.Steps.Any(s => s.Key == key && s.Order < step.Order))
            || d.Steps.Any(s => s.Order < step.Order && (s.State != "done" || s.Decision != "approve" || s.ReviewedVersion != d.SubmittedVersion)))
            throw new ReviewFailure(409, "STEP_NOT_READY");
        if (handoff)
        {
            if (step.State != "done" || step.Decision != "approve" || !step.RequiresHandoff || d.Status != "under-review")
                throw new ReviewFailure(409, "STEP_NOT_READY");
            return;
        }
        if (step.State is "done" or "stopped" or "skipped") throw new ReviewFailure(409, "STEP_DONE");
        if (accept)
        {
            if (step.State != "pending-accept" || (step.Key == "sales" ? d.Status != "submitted" : d.Status != "under-review"))
                throw new ReviewFailure(409, "STEP_NOT_READY");
        }
        else if (d.Status != "under-review" || step.State != "reviewing") throw new ReviewFailure(409, "STEP_NOT_READY");
        if (step.Key == "board" && d.Steps.Any(s => s.Order > step.Order)) throw new ReviewFailure(409, "STEP_NOT_READY");
    }
    private static void Key(string key)
    {
        if (string.IsNullOrWhiteSpace(key) || key.Length > 128 || key.Any(char.IsControl)) throw new ReviewFailure(400, "IDEMPOTENCY_KEY_REQUIRED");
    }
    public async Task<ReviewOutcome> Accept(Guid actorId, Guid id, ReviewRequest request, string key, CancellationToken ct)
        => await Execute(actorId, id, request, "accept", null, key, ct);
    public async Task<ReviewOutcome> Decide(Guid actorId, Guid id, DecisionRequest request, string key, CancellationToken ct)
    {
        if (request.Decision is not ("approve" or "revision" or "reject") || string.IsNullOrWhiteSpace(request.Comment) || request.Comment.Length > 4000)
            throw new ReviewFailure(400, "VALIDATION");
        return await Execute(actorId, id, new(request.RoundId, request.StepId, request.ViewedVersion, request.Step), request.Decision, request.Comment.Trim(), key, ct);
    }
    private async Task<ReviewOutcome> Execute(Guid actorId, Guid id, ReviewRequest request, string action, string? comment, string key, CancellationToken ct)
    {
        Key(key);
        var actor = await Actor(actorId, request.Step, ct);
        // Validation and idempotent replay happen under the engine's transaction lock.
        return await engine.Execute(new(id, actor, request, action, comment, key), ct);
    }
    public Task<ReviewOutcome> Handoff(Guid actorId, Guid id, ReviewRequest request, string key, CancellationToken ct)
        => Execute(actorId, id, request, "handoff", null, key, ct);
    public async Task<ReviewOutcome> Retry(Guid actorId, Guid id, string step, string key, CancellationToken ct)
    {
        Key(key);
        var actor = await Actor(actorId, step, ct);
        await ReadScoped(actor, id, ct);
        return await engine.RetryPending(id, actor, key, ct);
    }
}
