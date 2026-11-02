using System.Text.Json;
using Microsoft.Extensions.Configuration;
using Npgsql;
using QTKD.Application.Features.ContractApprovals;
using QTKD.Application.Features.Identity;

namespace QTKD.Infrastructure.ContractApprovals;

/// <summary>Internal legal exchanges are append-only audit events, separated from public approval comments.</summary>
public sealed class ContractCoordinationService(IApprovalDbSessions sessions, IIdentityService identity)
{
    private static async Task<IReadOnlyList<ReviewCoordination>> Load(NpgsqlConnection c, NpgsqlTransaction? tx, Guid? document, CancellationToken ct)
    {
        await using var cmd = PostgresApprovalStore.Command(c, tx, """
            SELECT DISTINCT ON (value_after->>'Id') value_after::text FROM qtkd.audit_log
            WHERE entity_type='ContractCoordination' AND (@id::uuid IS NULL OR entity_id=@id)
            ORDER BY value_after->>'Id', CASE WHEN action='coordination-reply' THEN 0 ELSE 1 END,acted_at DESC
            """, ("id", document));
        var values = new List<ReviewCoordination>();
        await using var r = await cmd.ExecuteReaderAsync(ct);
        while (await r.ReadAsync(ct)) values.Add(JsonSerializer.Deserialize<ReviewCoordination>(r.GetString(0))!);
        return values;
    }
    public async Task<IReadOnlyList<ReviewCoordination>> List(Guid actorId, Guid? id, CancellationToken ct)
    {
        var user = await identity.User(actorId, ct);
        var legal = user.Roles.Contains("NV_PC") && await identity.HasPermission(actorId, "approvals.review-legal", ct);
        if (user.Status != "Active" || user.MustChangePassword) throw new ReviewFailure(403, "FORBIDDEN");
        await using var session = await sessions.Open(false, ct); var c = session.Connection;
        var values = await Load(c, session.Transaction, id, ct);
        if (!legal) return values.Where(v => v.Department == user.Department).ToArray();
        var result = new List<ReviewCoordination>();
        foreach (var group in values.GroupBy(v => v.DocumentId))
        {
            var stored = await PostgresApprovalStore.Load(c, session.Transaction, group.Key, ct);
            if (stored?.Document.Steps.Any(s => s.Key == "legal" && s.AssigneeId == actorId) == true)
                result.AddRange(group.Where(v => v.RoundId == stored.Document.RoundId));
        }
        return result;
    }
    public async Task<ReviewCoordination> Request(Guid actorId, Guid id, CoordinationRequest request, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(request.Content) || request.Content.Length > 4000 || request.Expected.Step != "legal") throw new ReviewFailure(400, "VALIDATION");
        var user = await identity.User(actorId, ct);
        await using var session = await sessions.Open(true, ct); var c = session.Connection; var tx = session.Transaction!;
        await Lock(c, tx, id, ct);
        var stored = await PostgresApprovalStore.Load(c, tx, id, ct) ?? throw new ReviewFailure(404, "NOT_FOUND");
        var actor = new ReviewActor(actorId, "NV_PC", user.Department, "approvals.review-legal");
        await new PostgresApprovalTransaction(c, tx, stored.Document, stored.OwnerId).AssertActor(actor, ct);
        ContractApprovalService.Validate(actor, stored.Document, request.Expected, false);
        await using (var dept = PostgresApprovalStore.Command(c, tx, "SELECT 1 FROM qtkd.department WHERE code=@dept", ("dept", request.Department)))
            if (await dept.ExecuteScalarAsync(ct) is null) throw new ReviewFailure(400, "VALIDATION");
        var value = new ReviewCoordination(Guid.NewGuid(), id, stored.Document.RoundId, request.Department, request.Content.Trim(), user.FullName, DateTime.UtcNow);
        await Append(c, tx, actorId, value, "coordination-request", ct);
        await session.Commit(ct); return value;
    }
    public async Task<ReviewCoordination> Reply(Guid actorId, Guid id, Guid coordinationId, string reply, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(reply) || reply.Length > 4000) throw new ReviewFailure(400, "VALIDATION");
        var user = await identity.User(actorId, ct);
        if (user.Status != "Active" || user.MustChangePassword) throw new ReviewFailure(403, "FORBIDDEN");
        await using var session = await sessions.Open(true, ct); var c = session.Connection; var tx = session.Transaction!;
        await Lock(c, tx, id, ct);
        var stored = await PostgresApprovalStore.Load(c, tx, id, ct) ?? throw new ReviewFailure(404, "NOT_FOUND");
        var value = (await Load(c, tx, id, ct)).SingleOrDefault(v => v.Id == coordinationId) ?? throw new ReviewFailure(404, "NOT_FOUND");
        if (value.Department != user.Department) throw new ReviewFailure(403, "FORBIDDEN");
        if (value.RoundId != stored.Document.RoundId || stored.Document.RoundResult != "in-progress" || stored.Document.Version != stored.Document.SubmittedVersion
            || stored.Document.Steps.Single(s => s.Key == "legal").State != "reviewing") throw new ReviewFailure(409, "STEP_DONE");
        if (value.Reply is not null) throw new ReviewFailure(409, "STEP_DONE");
        // Recheck mutable account, department and grant under the same transaction lock.
        await using (var check = PostgresApprovalStore.Command(c, tx, """
            SELECT 1 FROM qtkd.user_account u JOIN qtkd.department d USING(department_id)
            WHERE user_id=@actor AND d.code=@dept AND u.status='Active' AND NOT u.must_change_password FOR SHARE OF u
            """, ("actor", actorId), ("dept", value.Department)))
            if (await check.ExecuteScalarAsync(ct) is null) throw new ReviewFailure(403, "FORBIDDEN");
        value = value with { Reply = reply.Trim(), RepliedBy = user.FullName, RepliedAt = DateTime.UtcNow };
        await Append(c, tx, actorId, value, "coordination-reply", ct); await session.Commit(ct); return value;
    }
    private static async Task Lock(NpgsqlConnection c, NpgsqlTransaction tx, Guid id, CancellationToken ct)
    {
        await using var cmd = PostgresApprovalStore.Command(c, tx, "SELECT contract_id FROM qtkd.contract WHERE contract_id=@id FOR UPDATE", ("id", id));
        if (await cmd.ExecuteScalarAsync(ct) is null) throw new ReviewFailure(404, "NOT_FOUND");
    }
    private static async Task Append(NpgsqlConnection c, NpgsqlTransaction tx, Guid actor, ReviewCoordination value, string action, CancellationToken ct)
    {
        await using var cmd = PostgresApprovalStore.Command(c, tx, """
            INSERT INTO qtkd.audit_log(log_id,entity_type,entity_id,action,actor_id,acted_at,value_after)
            VALUES(gen_random_uuid(),'ContractCoordination',@id,@action,@actor,clock_timestamp(),@value::jsonb)
            """, ("id", value.DocumentId), ("action", action), ("actor", actor), ("value", JsonSerializer.Serialize(value)));
        await cmd.ExecuteNonQueryAsync(ct);
    }
}
