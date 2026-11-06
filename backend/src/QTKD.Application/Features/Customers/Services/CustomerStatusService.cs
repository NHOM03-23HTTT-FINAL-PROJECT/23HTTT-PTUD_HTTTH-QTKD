using System.Text.Json;
using QTKD.Domain.Customers;
using QTKD.Application.Common.Interfaces;
using static QTKD.Application.Features.Customers.CustomerValidator;

namespace QTKD.Application.Features.Customers;

public sealed partial class CustomerService
{
    private sealed record StoredReview(string? ReasonGroup, StatusPlanItem[]? Plan, string? CoordinationNote);
    private static string RequiredReason(string? value)
    {
        var reason = (value ?? "").Trim();
        return reason.Length is > 0 and <= 5000 ? reason : throw new CustomerFailure(400, "VALIDATION");
    }
    private static void RequireReady(ReactivationSourceResult review)
    {
        if (!review.Complete || review.Checks is null || review.MissingSources is { Length: > 0 } || string.IsNullOrWhiteSpace(review.VerifiedBasis))
            throw new CustomerFailure(503, "REVIEW_INCOMPLETE", new { sources = review.MissingSources });
        if (!review.Allowed || review.Checks.Any(c => c.Status is not ("met" or "exception")))
            throw new CustomerFailure(409, "CONDITIONS_NOT_MET");
    }
    private async Task<(CustomerDecision Decision, StoredReview? Review)> Previous(CustomerRecord row, CancellationToken ct)
    {
        var previous = (await repository.Decisions(row.Id, ct)).LastOrDefault();
        if (previous?.Type != "Suspend") throw new CustomerFailure(503, "REVIEW_INCOMPLETE");
        return (previous, previous.Metadata is null ? null : JsonSerializer.Deserialize<StoredReview>(previous.Metadata, Json));
    }
    public async Task<ReactivationContext> GetReactivationContext(Guid actorId, string code, CancellationToken ct)
    {
        var actor = await Actor(actorId, ct);
        await using var tx = await repository.Begin(ct);
        var row = await Find(actor, code, ct);
        await RequireStatusPermission(actor, row, ct);
        if (row.Status != "Suspended") throw new CustomerFailure(409, "ALREADY_IN_STATUS");
        var (previous, metadata) = await Previous(row, ct);
        var review = await statusSource.Reactivation(row.Id, actorId, metadata?.ReasonGroup, null, ct);
        if (review.Checks is null) throw new CustomerFailure(503, "REVIEW_INCOMPLETE", new { sources = review.MissingSources });
        var suspension = new SuspensionContext(metadata?.ReasonGroup ?? "", previous.Reason, [], previous.By, "",
            previous.At, metadata?.Plan ?? [], metadata?.CoordinationNote ?? "", []);
        var allowed = review.Complete && review.Allowed && review.MissingSources is not { Length: > 0 }
            && !string.IsNullOrWhiteSpace(review.VerifiedBasis) && review.Checks.All(c => c.Status is "met" or "exception");
        await tx.Commit(ct);
        return new(suspension, review.Checks, review.VerifiedBasis, allowed, review.MissingSources);
    }
    public async Task<StatusChangeResult> Reactivate(Guid actorId, Guid sessionId, string code, string key, ReactivateCustomerRequest request, CancellationToken ct)
    {
        Key(key); var customerCode = Code(code); var hash = Hash(new { customerCode, request });
        var reason = RequiredReason(request.Reason);
        if (request.Evidence is { Length: > 0 }) throw new CustomerFailure(400, "EVIDENCE_UNAVAILABLE");
        await using var tx = await repository.Begin(ct);
        var actor = await Authorize(actorId, sessionId, "customers.view", ct);
        await repository.LockRequest(actorId, "reactivate", key, ct);
        var row = await Find(actor, customerCode, ct, locked: true);
        await RequireStatusPermission(actor, row, ct);
        var replay = await Replay<StatusChangeResult>(actorId, "reactivate", key, hash, row.Id, ct);
        if (replay is not null) { await tx.Commit(ct); return replay with { Replayed = true }; }
        if (row.Status != "Suspended") throw new CustomerFailure(409, "ALREADY_IN_STATUS");
        if (row.Version != request.BaseVersion) throw new CustomerFailure(409, "CONFLICT");
        var (_, metadata) = await Previous(row, ct);
        var review = await statusSource.Reactivation(row.Id, actorId, metadata?.ReasonGroup, request.Exception, ct);
        RequireReady(review);
        // Source checks may be slow; an expiring personal grant must be checked again.
        await RequireStatusPermission(actor, row, ct);
        await repository.SetActive(row.Id, ct);
        var decision = await repository.AddDecision(row.Id, actor.Id, reason, review.VerifiedBasis,
            JsonSerializer.Serialize(new { metadata?.ReasonGroup, checks = review.Checks }, Json), ct);
        var updated = await Find(actor, row.Id, ct);
        await repository.Audit(actor.Id, row.Id, "Customer", "CUSTOMER_REACTIVATED", JsonSerializer.Serialize(new
        {
            decisionId = decision, before = Status(row.Status), after = Status(updated.Status),
            fromVersion = row.Version, version = updated.Version, reason, basis = review.VerifiedBasis, plan = (string?)null
        }, Json), reason, ct);
        await repository.AddOutbox(decision, JsonSerializer.Serialize(new { customerCode = row.Code, type = "Reactivate", reason,
            plan = (string?)null, departments = Array.Empty<string>() }, Json), ct);
        var result = new StatusChangeResult(await View(updated, ct), false);
        await Receipt(actorId, "reactivate", key, hash, row.Id, result, ct);
        await tx.Commit(ct); return result;
    }
}
