using System.Text.Json;
using Npgsql;
using QTKD.Application.Features.ContractApprovals;

namespace QTKD.Infrastructure.ContractApprovals;

public sealed record AssignReviewRequest(Guid RoundId, Guid StepId, int ViewedVersion, Guid AssigneeId);

/// <summary>Hồ sơ trong tab phân công, kèm các bước người gọi được phân công.</summary>
public sealed record AssignmentItem(ReviewDocument Document, IReadOnlyList<string> ManagedSteps);

public sealed record AssignmentCandidate(Guid Id, string Name, string Title, string Department);

/// <summary>
/// SYS-CTR-10 · Trưởng bộ phận phân công người duyệt cho từng hồ sơ (quyền approvals.assign).
/// Người gọi phải là trưởng (department.manager_id) của phòng ban phụ trách bước; luật bước nằm ở AssignmentRules.
/// </summary>
public sealed class ApprovalAssignmentService(IApprovalDbSessions sessions)
{
    #region SQL

    private const string AssignerSql = """
        SELECT 1
        FROM qtkd.user_account u
        JOIN qtkd.role_permission p ON p.role = u.role AND p.permission_code = 'approvals.assign'
        WHERE u.user_id = @actor AND u.status = 'Active' AND NOT u.must_change_password
        """;

    private const string ManagedDepartmentsSql = "SELECT code FROM qtkd.department WHERE manager_id = @actor";

    private const string RoleDepartmentsSql = "SELECT code::text, department_code FROM qtkd.role_definition";

    private const string RunningContractsSql = """
        SELECT contract_id FROM qtkd.approval_round
        WHERE record_type = 'Contract' AND result = 'Running'
        ORDER BY submitted_at
        """;

    /// <summary>Người còn hoạt động, đúng vai trò và quyền duyệt của bước; bước kinh doanh phải cùng phòng hồ sơ; không phải người lập.</summary>
    private const string CandidatesSql = """
        SELECT u.user_id, u.full_name, r.name, d.department_name
        FROM qtkd.user_account u
        JOIN qtkd.role_definition r ON r.code = u.role
        JOIN qtkd.role_permission p ON p.role = u.role AND p.permission_code = @permission
        JOIN qtkd.department d USING (department_id)
        WHERE u.role::text = ANY(@roles) AND u.status = 'Active' AND NOT u.must_change_password
          AND u.user_id <> @owner AND (@step <> 'sales' OR d.code = @dept)
          AND (@candidate::uuid IS NULL OR u.user_id = @candidate::uuid)
        ORDER BY u.full_name
        """;

    private const string LockContractSql = "SELECT contract_id FROM qtkd.contract WHERE contract_id = @id FOR UPDATE";

    private const string UpdateStepSql = """
        UPDATE qtkd.approval_step
        SET assignee_id = @assignee,
            step_status = @status::qtkd.approval_step_status,
            assigned_at = CASE WHEN @status IN ('Pending', 'Reviewing') THEN now() ELSE assigned_at END,
            accepted_at = CASE WHEN @status = 'Reviewing' THEN now() ELSE accepted_at END
        WHERE step_id = @step AND decision IS NULL
        """;

    private const string NotifySql = """
        INSERT INTO qtkd.notification (notification_id, recipient_id, record_type, record_id, content, is_read, send_status, created_at)
        VALUES (gen_random_uuid(), @recipient, 'Contract', @id, @content, false, 'Pending', now())
        """;

    private const string AuditSql = """
        INSERT INTO qtkd.audit_log (log_id, entity_type, entity_id, action, actor_id, acted_at, value_before, value_after)
        VALUES (gen_random_uuid(), 'ContractApprovalAssignment', @id, @action, @actor, clock_timestamp(), @before::jsonb, @after::jsonb)
        """;

    #endregion

    /// <summary>Tab phân công: hồ sơ đang trong lượt duyệt có ít nhất một bước người gọi phụ trách.</summary>
    public async Task<IReadOnlyList<AssignmentItem>> Board(Guid actorId, CancellationToken ct)
    {
        await using var session = await sessions.Open(false, ct);
        var c = session.Connection;
        await AssertAssigner(c, null, actorId, ct);
        var managed = await ManagedDepartments(c, null, actorId, ct);
        if (managed.Count == 0) return [];
        var roleDepartments = await RoleDepartments(c, null, ct);

        var items = new List<AssignmentItem>();
        foreach (var id in await RunningContracts(c, ct))
        {
            var document = (await PostgresApprovalStore.Load(c, null, id, ct))?.Document;
            if (document is null) continue;
            var steps = AssignmentRules.ManagedSteps(document, managed, roleDepartments);
            if (steps.Count > 0) items.Add(new(document, steps));
        }
        return items;
    }

    /// <summary>Người có thể chọn cho một bước của hồ sơ.</summary>
    public async Task<IReadOnlyList<AssignmentCandidate>> Candidates(Guid actorId, Guid id, string step, CancellationToken ct)
    {
        await using var session = await sessions.Open(false, ct);
        var c = session.Connection;
        await AssertAssigner(c, null, actorId, ct);
        var loaded = await PostgresApprovalStore.Load(c, null, id, ct) ?? throw new ReviewFailure(404, "NOT_FOUND");
        await AssertManages(c, null, actorId, loaded.Document, step, ct);
        return await FindCandidates(c, null, loaded, step, null, ct);
    }

    /// <summary>Gán hoặc đổi người cho một bước chưa bắt đầu; kích hoạt bước nếu đã tới lượt.</summary>
    public async Task<ReviewDocument> Assign(Guid actorId, Guid id, AssignReviewRequest request, CancellationToken ct)
    {
        await using var session = await sessions.Open(true, ct);
        var c = session.Connection;
        var tx = session.Transaction!;

        await using (var lockCommand = PostgresApprovalStore.Command(c, tx, LockContractSql, ("id", id)))
            if (await lockCommand.ExecuteScalarAsync(ct) is null) throw new ReviewFailure(404, "NOT_FOUND");
        await AssertAssigner(c, tx, actorId, ct);

        var loaded = await PostgresApprovalStore.Load(c, tx, id, ct) ?? throw new ReviewFailure(404, "NOT_FOUND");
        var document = loaded.Document;
        if (document.RoundId != request.RoundId || document.RoundResult != "in-progress") throw new ReviewFailure(409, "STEP_DONE");
        if (document.Version != request.ViewedVersion || document.Version != document.SubmittedVersion) throw new ReviewFailure(409, "VERSION_MISMATCH");
        var step = document.Steps.SingleOrDefault(s => s.Id == request.StepId) ?? throw new ReviewFailure(404, "NOT_FOUND");
        await AssertManages(c, tx, actorId, document, step.Key, ct);

        // Gửi lặp cùng người: không đổi gì.
        if (step.AssigneeId == request.AssigneeId) { await session.Commit(ct); return document; }
        if (!AssignmentRules.CanAssign(document, step)) throw new ReviewFailure(409, "ASSIGNMENT_IMMUTABLE");
        if ((await FindCandidates(c, tx, loaded, step.Key, request.AssigneeId, ct)).Count == 0) throw new ReviewFailure(400, "INVALID_ASSIGNEE");

        var activates = AssignmentRules.ActivatesOnAssign(document, step);
        var status = AssignmentRules.StatusAfterAssign(step, activates);
        await using (var update = PostgresApprovalStore.Command(c, tx, UpdateStepSql,
            ("assignee", request.AssigneeId), ("status", status), ("step", step.Id)))
            if (await update.ExecuteNonQueryAsync(ct) != 1) throw new ReviewFailure(409, "ASSIGNMENT_IMMUTABLE");

        var label = AssignmentRules.StepLabel(step.Key);
        await Notify(c, tx, request.AssigneeId, id, $"Bạn được phân công {label} hồ sơ {document.Title}.", ct);
        if (step.AssigneeId is { } previous)
            await Notify(c, tx, previous, id, $"Bạn không còn được phân công {label} hồ sơ {document.Title}.", ct);

        await using (var audit = PostgresApprovalStore.Command(c, tx, AuditSql,
            ("id", id), ("action", step.AssigneeId is null ? "assign" : "reassign"), ("actor", actorId),
            ("before", JsonSerializer.Serialize(new { stepId = step.Id, step = step.Key, assigneeId = step.AssigneeId })),
            ("after", JsonSerializer.Serialize(new { stepId = step.Id, step = step.Key, assigneeId = request.AssigneeId, activated = activates }))))
            await audit.ExecuteNonQueryAsync(ct);

        var result = (await PostgresApprovalStore.Load(c, tx, id, ct))!.Document;
        await session.Commit(ct);
        return result;
    }

    #region Helpers

    private static async Task AssertAssigner(NpgsqlConnection c, NpgsqlTransaction? tx, Guid actorId, CancellationToken ct)
    {
        // Trong transaction ghi: khóa dòng quyền để quyền bị thu hồi đồng thời không lọt qua.
        var sql = tx is null ? AssignerSql : AssignerSql + " FOR SHARE OF u, p";
        await using var cmd = PostgresApprovalStore.Command(c, tx, sql, ("actor", actorId));
        if (await cmd.ExecuteScalarAsync(ct) is null) throw new ReviewFailure(403, "FORBIDDEN");
    }

    private static async Task AssertManages(NpgsqlConnection c, NpgsqlTransaction? tx, Guid actorId, ReviewDocument document, string step, CancellationToken ct)
    {
        if (!AssignmentRules.StepKeys.Contains(step)) throw new ReviewFailure(400, "VALIDATION");
        var managed = await ManagedDepartments(c, tx, actorId, ct);
        var department = AssignmentRules.StepDepartment(document, step, await RoleDepartments(c, tx, ct));
        if (!managed.Contains(department)) throw new ReviewFailure(403, "FORBIDDEN");
    }

    private static async Task<IReadOnlySet<string>> ManagedDepartments(NpgsqlConnection c, NpgsqlTransaction? tx, Guid actorId, CancellationToken ct)
    {
        var codes = new HashSet<string>();
        await using var cmd = PostgresApprovalStore.Command(c, tx, ManagedDepartmentsSql, ("actor", actorId));
        await using var reader = await cmd.ExecuteReaderAsync(ct);
        while (await reader.ReadAsync(ct)) codes.Add(reader.GetString(0));
        return codes;
    }

    private static async Task<IReadOnlyDictionary<string, string>> RoleDepartments(NpgsqlConnection c, NpgsqlTransaction? tx, CancellationToken ct)
    {
        var map = new Dictionary<string, string>();
        await using var cmd = PostgresApprovalStore.Command(c, tx, RoleDepartmentsSql);
        await using var reader = await cmd.ExecuteReaderAsync(ct);
        while (await reader.ReadAsync(ct)) map[reader.GetString(0)] = reader.GetString(1);
        return map;
    }

    private static async Task<IReadOnlyList<Guid>> RunningContracts(NpgsqlConnection c, CancellationToken ct)
    {
        var ids = new List<Guid>();
        await using var cmd = PostgresApprovalStore.Command(c, null, RunningContractsSql);
        await using var reader = await cmd.ExecuteReaderAsync(ct);
        while (await reader.ReadAsync(ct)) ids.Add(reader.GetGuid(0));
        return ids;
    }

    private static async Task<IReadOnlyList<AssignmentCandidate>> FindCandidates(NpgsqlConnection c, NpgsqlTransaction? tx,
        PostgresApprovalStore.Loaded loaded, string step, Guid? candidate, CancellationToken ct)
    {
        var sql = tx is null ? CandidatesSql : CandidatesSql + " FOR SHARE OF u, p";
        await using var cmd = PostgresApprovalStore.Command(c, tx, sql,
            ("permission", ContractApprovalService.Permission(step)), ("roles", AssignmentRules.StepRoles(step).ToArray()), ("step", step),
            ("owner", loaded.OwnerId), ("dept", loaded.Document.Department), ("candidate", candidate));
        var items = new List<AssignmentCandidate>();
        await using var reader = await cmd.ExecuteReaderAsync(ct);
        while (await reader.ReadAsync(ct)) items.Add(new(reader.GetGuid(0), reader.GetString(1), reader.GetString(2), reader.GetString(3)));
        return items;
    }

    private static async Task Notify(NpgsqlConnection c, NpgsqlTransaction tx, Guid recipient, Guid id, string content, CancellationToken ct)
    {
        await using var cmd = PostgresApprovalStore.Command(c, tx, NotifySql, ("recipient", recipient), ("id", id), ("content", content));
        await cmd.ExecuteNonQueryAsync(ct);
    }

    #endregion
}
