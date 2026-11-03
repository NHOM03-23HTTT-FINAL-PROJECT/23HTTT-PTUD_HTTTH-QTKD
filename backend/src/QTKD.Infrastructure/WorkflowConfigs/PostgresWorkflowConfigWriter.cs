using System.Text.Json;
using Npgsql;
using QTKD.Application.Features.WorkflowConfigs;
using QTKD.Infrastructure.ContractApprovals;

namespace QTKD.Infrastructure.WorkflowConfigs;

/// <summary>Thao tác bên trong transaction ghi do <see cref="PostgresWorkflowConfigStore.Write{T}"/> mở.</summary>
internal sealed class PostgresWorkflowConfigWriter(ApprovalDbSession session, Guid actorId) : IWorkflowConfigWrite
{
    private const string AssertAdminSql = """
        SELECT 1
        FROM qtkd.user_account u
        JOIN qtkd.role_permission p ON p.role = u.role AND p.permission_code = 'workflows.manage'
        WHERE u.user_id = @actor AND u.status = 'Active' AND NOT u.must_change_password
        FOR SHARE OF u, p
        """;

    private const string ReceiptSql = """
        SELECT value_after->>'fingerprint', value_after->>'code'
        FROM qtkd.audit_log
        WHERE entity_type = 'WorkflowConfig' AND action = 'activate' AND actor_id = @actor AND value_after->>'key' = @key
        ORDER BY acted_at DESC
        LIMIT 1
        """;

    /// <summary>Tắt phiên bản đang áp dụng của mã hoặc của cùng loại hồ sơ + phạm vi; trả về stages cũ cho audit.</summary>
    private const string DeactivateSql = """
        UPDATE qtkd.workflow_config SET is_active = false
        WHERE is_active
          AND (code = @code OR (doc_type = @type AND department_id = (SELECT department_id FROM qtkd.department WHERE code = @scope)))
        RETURNING stages::text
        """;

    private const string InsertSql = """
        INSERT INTO qtkd.workflow_config
            (config_id, code, version, config_name, doc_type, department_id, stages, change_summary, is_active, activated_by, activated_at)
        SELECT gen_random_uuid(), @code,
               COALESCE((SELECT max(version) FROM qtkd.workflow_config WHERE code = @code), 0) + 1,
               @name, @type, d.department_id, @stages::jsonb, @summary, true, @actor, clock_timestamp()
        FROM qtkd.department d
        WHERE d.code = @scope
        RETURNING config_id
        """;

    private const string AuditSql = """
        INSERT INTO qtkd.audit_log (log_id, entity_type, entity_id, action, actor_id, acted_at, value_before, value_after, note)
        VALUES (gen_random_uuid(), 'WorkflowConfig', @id, 'activate', @actor, clock_timestamp(), @before::jsonb, @after::jsonb, @note)
        """;

    public async Task AssertAdmin(CancellationToken ct)
    {
        await using var cmd = Command(AssertAdminSql, ("actor", actorId));
        if (await cmd.ExecuteScalarAsync(ct) is null) throw new WorkflowConfigFailure(403, "FORBIDDEN");
    }

    public Task<WorkflowCatalog> Catalog(CancellationToken ct) =>
        WorkflowConfigQueries.Catalog(session.Connection, session.Transaction, ct);

    public async Task<WorkflowReceipt?> Receipt(string idempotencyKey, CancellationToken ct)
    {
        await using var cmd = Command(ReceiptSql, ("actor", actorId), ("key", idempotencyKey));
        await using var reader = await cmd.ExecuteReaderAsync(ct);
        return await reader.ReadAsync(ct) ? new(reader.GetString(0), reader.GetString(1)) : null;
    }

    public Task<WorkflowConfig?> Find(string code, CancellationToken ct) =>
        WorkflowConfigQueries.ByCode(session.Connection, session.Transaction, code, ct);

    public Task<WorkflowConfig?> ActiveFor(string docType, string scope, CancellationToken ct) =>
        WorkflowConfigQueries.ActiveFor(session.Connection, session.Transaction, docType, scope, ct);

    public async Task<WorkflowConfig> Save(NewWorkflowVersion version, CancellationToken ct)
    {
        var draft = version.Draft;

        string? stagesBefore;
        await using (var deactivate = Command(DeactivateSql, ("code", version.Code), ("type", draft.DocType), ("scope", draft.Scope)))
            stagesBefore = await deactivate.ExecuteScalarAsync(ct) as string;

        Guid configId;
        await using (var insert = Command(InsertSql,
            ("code", version.Code), ("name", draft.Name), ("type", draft.DocType), ("scope", draft.Scope),
            ("stages", JsonSerializer.Serialize(draft.Stages, WorkflowConfigQueries.Json)),
            ("summary", version.Summary), ("actor", actorId)))
            configId = (Guid)(await insert.ExecuteScalarAsync(ct) ?? throw new WorkflowConfigFailure(400, "VALIDATION"));

        var saved = (await Find(version.Code, ct))!;

        var after = new
        {
            key = version.IdempotencyKey, fingerprint = version.Fingerprint,
            code = saved.Code, version = saved.Version,
            name = draft.Name, docType = draft.DocType, scope = draft.Scope, stages = draft.Stages,
        };
        await using (var audit = Command(AuditSql,
            ("id", configId), ("actor", actorId), ("before", stagesBefore),
            ("after", JsonSerializer.Serialize(after, WorkflowConfigQueries.Json)), ("note", version.Summary)))
            await audit.ExecuteNonQueryAsync(ct);

        return saved;
    }

    private NpgsqlCommand Command(string sql, params (string Name, object? Value)[] parameters) =>
        PostgresApprovalStore.Command(session.Connection, session.Transaction, sql, parameters);
}
