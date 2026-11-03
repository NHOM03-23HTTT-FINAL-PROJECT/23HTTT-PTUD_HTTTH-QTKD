using System.Text.Json;
using Npgsql;
using NpgsqlTypes;
using QTKD.Application.Features.Customers;

namespace QTKD.Infrastructure.Customers;

public sealed partial class CustomerService
{
    private static readonly HashSet<string> SuspensionReasons =
        ["CONG_NO", "VI_PHAM_HD", "TRANH_CHAP", "VAN_HANH", "DE_NGHI_KH", "KHAC"];
    private sealed record StoredReview(string? ReasonGroup, StatusPlanItem[]? Plan, string? CoordinationNote);
    private sealed record PreviousSuspension(string Reason, string By, DateTime At, StoredReview? Review);

    private static string RequiredReason(string? value)
    {
        var reason = (value ?? "").Trim();
        return reason.Length is > 0 and <= 5000 ? reason : throw new CustomerFailure(400, "VALIDATION");
    }

    private static void RequireNoUnstoredEvidence(StatusEvidence[]? files)
    {
        // A browser-provided filename is not a stored file or verified evidence.
        if (files is { Length: > 0 }) throw new CustomerFailure(400, "EVIDENCE_UNAVAILABLE");
    }

    private static void RequireComplete(SuspensionReview review)
    {
        if (review.Items is null || review.FailedKinds is null || review.FailedKinds.Length > 0
            || review.MissingSources is { Length: > 0 })
            throw new CustomerFailure(503, "REVIEW_INCOMPLETE", new
            {
                sources = (review.FailedKinds ?? []).Concat(review.MissingSources ?? []).Distinct().ToArray()
            });
    }

    private static void RequireReady(ReactivationSourceResult result)
    {
        if (!result.Complete || result.Checks is null || result.MissingSources is { Length: > 0 })
            throw new CustomerFailure(503, "REVIEW_INCOMPLETE", new { sources = result.MissingSources });
        if (!result.Allowed || result.Checks.Any(c => c.Status is not ("met" or "exception")))
            throw new CustomerFailure(409, "CONDITIONS_NOT_MET");
        if (string.IsNullOrWhiteSpace(result.VerifiedBasis))
            throw new CustomerFailure(503, "REVIEW_INCOMPLETE", new { sources = result.MissingSources });
    }

    private static StatusPlanItem[] ValidatePlan(SuspensionReview review, StatusPlanItem[]? supplied)
    {
        var plan = supplied ?? [];
        if (plan.Length != review.Items.Length || plan.Any(p => string.IsNullOrWhiteSpace(p.Id) || string.IsNullOrWhiteSpace(p.Option))
            || plan.Select(p => p.Id).Distinct(StringComparer.Ordinal).Count() != plan.Length)
            throw new CustomerFailure(409, "CONFLICT");
        foreach (var item in review.Items)
        {
            var choice = plan.SingleOrDefault(p => p.Id == item.Id);
            if (choice is null || item.Options is null || !item.Options.Contains(choice.Option, StringComparer.Ordinal))
                throw new CustomerFailure(409, "CONFLICT");
        }
        return plan;
    }

    private static async Task<PreviousSuspension?> LastSuspension(NpgsqlConnection c, NpgsqlTransaction tx, Guid customerId, CancellationToken ct)
    {
        await using var cmd = Cmd(c, tx, """
            SELECT d.decision_type::text, d.reason, u.full_name, d.decided_at, d.review_metadata::text
            FROM qtkd.customer_status_decision d JOIN qtkd.user_account u ON u.user_id=d.confirmed_by
            WHERE d.customer_id=@id
            ORDER BY d.decided_at DESC, d.decision_id DESC LIMIT 1
            """, ("id", customerId));
        await using var r = await cmd.ExecuteReaderAsync(ct);
        if (!await r.ReadAsync(ct) || r.GetString(0) != "Suspend") return null;
        var metadata = r.IsDBNull(4) ? null : JsonSerializer.Deserialize<StoredReview>(r.GetString(4), Json);
        return new PreviousSuspension(r.GetString(1), r.GetString(2), r.GetDateTime(3), metadata);
    }

    public async Task<SuspensionReview> GetSuspensionReview(Guid actorId, string code, CancellationToken ct)
    {
        var actor = await GetActor(actorId, ct);
        await using var c = Connection(); await c.OpenAsync(ct); await using var tx = await c.BeginTransactionAsync(ct);
        var row = await Find(c, tx, actor, ParseCode(code), false, ct); MayEdit(actor, row);
        if (row.Status != "Active") throw new CustomerFailure(409, "ALREADY_IN_STATUS");
        var review = await statusSource.Suspension(c, tx, row.Id, actorId, ct);
        if (review.Items is null || review.FailedKinds is null) throw new CustomerFailure(503, "REVIEW_INCOMPLETE");
        await tx.CommitAsync(ct); return review;
    }

    public async Task<ReactivationContext> GetReactivationContext(Guid actorId, string code, CancellationToken ct)
    {
        var actor = await GetActor(actorId, ct);
        await using var c = Connection(); await c.OpenAsync(ct); await using var tx = await c.BeginTransactionAsync(ct);
        var row = await Find(c, tx, actor, ParseCode(code), false, ct); MayEdit(actor, row);
        if (row.Status != "Suspended") throw new CustomerFailure(409, "ALREADY_IN_STATUS");
        var previous = await LastSuspension(c, tx, row.Id, ct) ?? throw new CustomerFailure(503, "REVIEW_INCOMPLETE");
        var result = await statusSource.Reactivation(c, tx, row.Id, actorId, previous.Review?.ReasonGroup, null, ct);
        if (result.Checks is null)
            throw new CustomerFailure(503, "REVIEW_INCOMPLETE", new { sources = result.MissingSources });
        var suspension = new SuspensionContext(previous.Review?.ReasonGroup ?? "", previous.Reason, [], previous.By, "",
            previous.At, previous.Review?.Plan ?? [], previous.Review?.CoordinationNote ?? "", []);
        var canReactivate = result.Complete && result.Allowed && result.MissingSources is not { Length: > 0 }
            && !string.IsNullOrWhiteSpace(result.VerifiedBasis)
            && result.Checks.All(check => check.Status is "met" or "exception");
        await tx.CommitAsync(ct); return new ReactivationContext(suspension, result.Checks, result.VerifiedBasis, canReactivate, result.MissingSources);
    }

    public async Task<StatusChangeResult> Suspend(Guid actorId, Guid sessionId, string code, string key,
        SuspendCustomerRequest request, CancellationToken ct)
    {
        Key(key); var customerCode = ParseCode(code); var hash = Hash(new { customerCode, request });
        var reason = RequiredReason(request.Reason);
        if (request.ReasonGroup is null || !SuspensionReasons.Contains(request.ReasonGroup)) throw new CustomerFailure(400, "VALIDATION");
        RequireNoUnstoredEvidence(request.Evidence);
        var note = (request.CoordinationNote ?? "").Trim();
        if (note.Length > 5000) throw new CustomerFailure(400, "VALIDATION");
        await using var c = Connection(); await c.OpenAsync(ct); await using var tx = await c.BeginTransactionAsync(ct);
        var actor = await AuthorizeMutation(c, tx, actorId, sessionId, "customers.change-status", ct);
        await LockKey(c, tx, actorId, "suspend", key, ct);
        var row = await Find(c, tx, actor, customerCode, true, ct); MayEdit(actor, row);
        var receipt = await Receipt(c, tx, actorId, "suspend", key, hash, ct);
        if (receipt is not null)
        {
            if (receipt.Value.Id != row.Id) throw new CustomerFailure(409, "IDEMPOTENCY_KEY_REUSED");
            return JsonSerializer.Deserialize<StatusChangeResult>(receipt.Value.Json, Json)! with { Replayed = true };
        }
        if (row.Status != "Active") throw new CustomerFailure(409, "ALREADY_IN_STATUS");
        if (row.Version != request.BaseVersion) throw new CustomerFailure(409, "CONFLICT");
        var review = await statusSource.Suspension(c, tx, row.Id, actorId, ct); RequireComplete(review);
        var plan = ValidatePlan(review, request.Plan);
        var descriptions = review.Items.Select(item => $"{item.Title}: {plan.Single(p => p.Id == item.Id).Option}").ToArray();
        var followUp = string.Join("; ", descriptions.Concat(string.IsNullOrEmpty(note) ? [] : [note]));
        var metadata = new StoredReview(request.ReasonGroup, plan, note);
        var result = await SaveStatus(c, tx, actor, row, "Suspend", reason, null, followUp, metadata, review.Items, ct);
        await SaveReceipt(c, tx, actorId, "suspend", key, hash, row.Id, result, ct);
        await tx.CommitAsync(ct); return result;
    }

    public async Task<StatusChangeResult> Reactivate(Guid actorId, Guid sessionId, string code, string key,
        ReactivateCustomerRequest request, CancellationToken ct)
    {
        Key(key); var customerCode = ParseCode(code); var hash = Hash(new { customerCode, request });
        var reason = RequiredReason(request.Reason); RequireNoUnstoredEvidence(request.Evidence);
        await using var c = Connection(); await c.OpenAsync(ct); await using var tx = await c.BeginTransactionAsync(ct);
        var actor = await AuthorizeMutation(c, tx, actorId, sessionId, "customers.change-status", ct);
        await LockKey(c, tx, actorId, "reactivate", key, ct);
        var row = await Find(c, tx, actor, customerCode, true, ct); MayEdit(actor, row);
        var receipt = await Receipt(c, tx, actorId, "reactivate", key, hash, ct);
        if (receipt is not null)
        {
            if (receipt.Value.Id != row.Id) throw new CustomerFailure(409, "IDEMPOTENCY_KEY_REUSED");
            return JsonSerializer.Deserialize<StatusChangeResult>(receipt.Value.Json, Json)! with { Replayed = true };
        }
        if (row.Status != "Suspended") throw new CustomerFailure(409, "ALREADY_IN_STATUS");
        if (row.Version != request.BaseVersion) throw new CustomerFailure(409, "CONFLICT");
        var previous = await LastSuspension(c, tx, row.Id, ct) ?? throw new CustomerFailure(503, "REVIEW_INCOMPLETE");
        var review = await statusSource.Reactivation(c, tx, row.Id, actorId, previous.Review?.ReasonGroup, request.Exception, ct);
        RequireReady(review);
        var result = await SaveStatus(c, tx, actor, row, "Reactivate", reason, review.VerifiedBasis, null,
            new { previous.Review?.ReasonGroup, checks = review.Checks }, [], ct);
        await SaveReceipt(c, tx, actorId, "reactivate", key, hash, row.Id, result, ct);
        await tx.CommitAsync(ct); return result;
    }

    private static async Task<StatusChangeResult> SaveStatus(NpgsqlConnection c, NpgsqlTransaction tx, Actor actor, Row row,
        string type, string reason, string? basis, string? plan, object metadata, StatusImpactItem[] impacts, CancellationToken ct)
    {
        var newStatus = type == "Suspend" ? "Suspended" : "Active";
        await using (var update = Cmd(c, tx, $"UPDATE qtkd.customer SET status='{newStatus}'::qtkd.active_status, customer_updated_at=clock_timestamp(), flow_revision=flow_revision+1 WHERE customer_id=@id", ("id", row.Id)))
            await update.ExecuteNonQueryAsync(ct);
        Guid decision;
        await using (var insert = Cmd(c, tx, """
            INSERT INTO qtkd.customer_status_decision(customer_id,decision_type,reason,basis,follow_up_plan,confirmed_by,review_metadata)
            VALUES (@customer,@type::qtkd.customer_decision_type,@reason,@basis,@plan,@actor,@metadata) RETURNING decision_id
            """, ("customer", row.Id), ("type", type), ("reason", reason), ("basis", basis), ("plan", string.IsNullOrEmpty(plan) ? null : plan), ("actor", actor.Id)))
        {
            insert.Parameters.AddWithValue("metadata", NpgsqlDbType.Jsonb, JsonSerializer.Serialize(metadata, Json));
            decision = (Guid)(await insert.ExecuteScalarAsync(ct))!;
        }
        var updated = await Find(c, tx, actor, row.Id, false, ct);
        var action = type == "Suspend" ? "CUSTOMER_SUSPENDED" : "CUSTOMER_REACTIVATED";
        var audit = new { decisionId = decision, before = Status(row.Status), after = Status(updated.Status),
            fromVersion = row.Version, version = updated.Version, reason, basis, plan };
        await using (var log = Cmd(c, tx, "INSERT INTO qtkd.audit_log(entity_type,entity_id,action,actor_id,acted_at,value_after,note) VALUES ('Customer',@customer,@action,@actor,clock_timestamp(),@value,@reason)",
            ("customer", row.Id), ("action", action), ("actor", actor.Id), ("reason", reason)))
        {
            log.Parameters.AddWithValue("value", NpgsqlDbType.Jsonb, JsonSerializer.Serialize(audit, Json));
            await log.ExecuteNonQueryAsync(ct);
        }
        await using (var outbox = Cmd(c, tx, "INSERT INTO qtkd.customer_status_outbox(decision_id,payload) VALUES (@decision,@payload)", ("decision", decision)))
        {
            outbox.Parameters.AddWithValue("payload", NpgsqlDbType.Jsonb, JsonSerializer.Serialize(new { customerCode = row.Code, type, reason, plan,
                departments = impacts.Select(i => i.Department).Distinct().ToArray() }, Json));
            await outbox.ExecuteNonQueryAsync(ct);
        }
        return new StatusChangeResult(await View(c, tx, updated, ct), false);
    }
}
