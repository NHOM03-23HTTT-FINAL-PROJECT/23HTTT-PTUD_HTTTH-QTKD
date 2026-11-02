using System.Text.Json;
using Microsoft.Extensions.Configuration;
using Npgsql;
using QTKD.Application.Features.ContractApprovals;

namespace QTKD.Infrastructure.ContractApprovals;

public sealed record AssignReviewRequest(Guid RoundId, Guid StepId, int ViewedVersion, Guid AssigneeId);

public sealed class WorkflowAssignmentService(IApprovalDbSessions sessions)
{
    public async Task<ReviewDocument> Assign(Guid actorId, Guid id, AssignReviewRequest request, CancellationToken ct)
    {
        await using var session = await sessions.Open(true, ct); var c = session.Connection; var tx = session.Transaction!;
        await using (var cmd = PostgresApprovalStore.Command(c, tx, "SELECT contract_id FROM qtkd.contract WHERE contract_id=@id FOR UPDATE", ("id", id)))
            if (await cmd.ExecuteScalarAsync(ct) is null) throw new ReviewFailure(404, "NOT_FOUND");
        await using (var access = PostgresApprovalStore.Command(c, tx, """
            SELECT 1 FROM qtkd.user_account u JOIN qtkd.role_permission p ON p.role=u.role AND p.permission_code='workflows.manage'
            WHERE u.user_id=@actor AND u.status='Active' AND NOT u.must_change_password FOR SHARE OF u,p
            """, ("actor", actorId)))
            if (await access.ExecuteScalarAsync(ct) is null) throw new ReviewFailure(403, "FORBIDDEN");
        var stored = await PostgresApprovalStore.Load(c, tx, id, ct) ?? throw new ReviewFailure(404, "NOT_FOUND");
        var doc = stored.Document;
        if (doc.RoundId != request.RoundId || doc.RoundResult != "in-progress") throw new ReviewFailure(409, "STEP_DONE");
        if (doc.Version != request.ViewedVersion || doc.Version != doc.SubmittedVersion) throw new ReviewFailure(409, "VERSION_MISMATCH");
        var step = doc.Steps.SingleOrDefault(s => s.Id == request.StepId) ?? throw new ReviewFailure(404, "NOT_FOUND");
        if (step.AssigneeId == request.AssigneeId) { await session.Commit(ct); return doc; }
        if (step.AssigneeId is not null || step.State is not ("waiting" or "unassigned")) throw new ReviewFailure(409, "ASSIGNMENT_IMMUTABLE");
        var role = step.Key switch { "sales" => "SalesManager", "legal" => "LegalStaff", "board" => "BoardMember", _ => throw new ReviewFailure(400, "VALIDATION") };
        await using (var candidate = PostgresApprovalStore.Command(c, tx, """
            SELECT 1 FROM qtkd.user_account u JOIN qtkd.role_permission p ON p.role=u.role AND p.permission_code=@permission
            JOIN qtkd.department d USING(department_id)
            WHERE u.user_id=@candidate AND u.role::text=@role AND u.status='Active' AND NOT u.must_change_password
            AND (@role<>'SalesManager' OR d.code=@dept) FOR SHARE OF u,p
            """, ("candidate", request.AssigneeId), ("role", role), ("permission", ContractApprovalService.Permission(step.Key)), ("dept", doc.Department)))
            if (await candidate.ExecuteScalarAsync(ct) is null) throw new ReviewFailure(400, "INVALID_ASSIGNEE");
        await using (var update = PostgresApprovalStore.Command(c, tx,
            "UPDATE qtkd.approval_step SET assignee_id=@candidate WHERE step_id=@step AND assignee_id IS NULL",
            ("candidate", request.AssigneeId), ("step", step.Id))) await update.ExecuteNonQueryAsync(ct);
        await using (var audit = PostgresApprovalStore.Command(c, tx, """
            INSERT INTO qtkd.audit_log(log_id,entity_type,entity_id,action,actor_id,acted_at,value_after)
            VALUES(gen_random_uuid(),'ContractApprovalAssignment',@id,'assign',@actor,clock_timestamp(),@data::jsonb)
            """, ("id", id), ("actor", actorId), ("data", JsonSerializer.Serialize(request)))) await audit.ExecuteNonQueryAsync(ct);
        var result = (await PostgresApprovalStore.Load(c, tx, id, ct))!.Document;
        await session.Commit(ct); return result;
    }
}
