using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using Npgsql;
using QTKD.Application.Common.Interfaces;
using QTKD.Application.Features.Contracts;
using QTKD.Domain.Contracts;
using static QTKD.Infrastructure.Persistence.PgDatabase;

namespace QTKD.Infrastructure.Persistence;

public partial class PostgresContractStore : IContractStore
{
    private readonly PgDatabase _db;
    private readonly string _uploadRoot;

    public PostgresContractStore(PgDatabase db, string uploadRoot)
    {
        _db = db;
        _uploadRoot = uploadRoot;
    }

    // All scope checks happen before filtering, counting and pagination. A role alone never grants board/legal access.
    private const string Scope = """
        c.document_type = 'Contract' AND (
            ($2 = 'SalesStaff' AND c.owner_id = $1) OR
            ($2 = 'SalesManager' AND c.owning_department_id = $3) OR
            ($2 IN ('LegalStaff', 'LegalManager', 'BoardMember', 'BoardChair') AND (
                EXISTS (
                    SELECT 1 FROM qtkd.approval_round ar
                    JOIN qtkd.approval_step st USING(round_id)
                    WHERE ar.contract_id = c.contract_id AND st.assignee_id = $1
                ) OR
                EXISTS (
                    SELECT 1 FROM qtkd.contract_cancellation_request cr
                    WHERE cr.contract_id = c.contract_id AND (cr.sales_assignee_id = $1 OR cr.board_assignee_id = $1)
                )
            ))
        )
        """;

    private static object?[] ScopeArgs(Actor actor) => [actor.Id, actor.Role, actor.ManagedDepartmentId];

    private static void ViewRole(Actor actor)
    {
        if (!actor.CanViewContracts)
        {
            throw new BusinessException("FORBIDDEN", 403);
        }
    }

    public async Task<JsonObject> FormOptions(Actor actor, CancellationToken ct)
    {
        ViewRole(actor);
        await using var c = await _db.Open(ct);

        var customers = await Array(c, null, """
            SELECT coalesce(jsonb_agg(jsonb_build_object(
                'code', customer_code,
                'name', customer_name,
                'taxCode', tax_code,
                'address', address,
                'representative', legal_representative,
                'contactName', contact_name,
                'phone', phone,
                'email', email,
                'status', lower(status::text)
            )), '[]')
            FROM qtkd.customer
            WHERE status = 'Active'
            """, ct);

        var areas = await Array(c, null, """
            SELECT coalesce(jsonb_agg(jsonb_build_object(
                'code', a.area_code,
                'name', a.area_name,
                'level', a.level
            ) ORDER BY a.hierarchy_path), '[]')
            FROM qtkd.area a
            WHERE a.status = 'Active'
              AND NOT EXISTS (
                WITH RECURSIVE parents AS (
                    SELECT area_id, parent_area_id, status FROM qtkd.area WHERE area_id = a.parent_area_id
                    UNION
                    SELECT p.area_id, p.parent_area_id, p.status FROM qtkd.area p JOIN parents x ON p.area_id = x.parent_area_id
                )
                SELECT 1 FROM parents WHERE status <> 'Active'
            )
            """, ct);

        var services = await Array(c, null, """
            SELECT coalesce(jsonb_agg(jsonb_build_object(
                'serviceCode', service_code,
                'serviceName', service_name,
                'unit', unit,
                'requiresArea', requires_area
            ) ORDER BY service_code), '[]')
            FROM qtkd.service
            """, ct);

        return new JsonObject
        {
            ["customers"] = customers,
            ["areas"] = areas,
            ["services"] = services,
            ["templates"] = Templates(),
            ["contractTypes"] = new JsonArray("Dịch vụ logistics", "Vận chuyển", "Kho bãi")
        };
    }

    private static JsonArray Templates() => new(JsonSerializer.SerializeToNode(new
    {
        code = "MHD-THAM-KHAO-01",
        name = "Mẫu tham khảo dịch vụ logistics",
        version = "1",
        title = "Hợp đồng dịch vụ logistics",
        contractType = "Dịch vụ logistics",
        paymentTerm = "Thanh toán theo thỏa thuận của hai bên.",
        content = "Điều 1. Phạm vi dịch vụ\nCác bên thống nhất các hạng mục dịch vụ ghi trong hồ sơ.\n\nĐiều 2. Thanh toán\nHoàn thiện theo thỏa thuận thực tế trước khi trình duyệt.",
        services = System.Array.Empty<object>()
    }, Json));

    public async Task<JsonObject> FilterOptions(Actor actor, CancellationToken ct)
    {
        ViewRole(actor);
        await using var c = await _db.Open(ct);

        var areas = await Array(c, null, $$"""
            SELECT coalesce(jsonb_agg(jsonb_build_object(
                'code', a.area_code,
                'name', a.area_name,
                'level', a.level
            ) ORDER BY a.hierarchy_path), '[]')
            FROM qtkd.area a
            WHERE EXISTS (
                SELECT 1 FROM qtkd.contract_item ci
                JOIN qtkd.contract c USING(contract_id)
                WHERE ci.area_id = a.area_id AND ({{Scope}})
            )
            """, ct, ScopeArgs(actor));

        var types = await Array(c, null, $$"""
            SELECT coalesce(jsonb_agg(t.contract_type ORDER BY t.contract_type), '[]')
            FROM (
                SELECT DISTINCT c.contract_type
                FROM qtkd.contract c
                WHERE {{Scope}}
            ) t
            """, ct, ScopeArgs(actor));

        return new JsonObject
        {
            ["areas"] = areas,
            ["contractTypes"] = types,
            ["coordinationDepartments"] = new JsonArray()
        };
    }

    public async Task<JsonObject> List(Actor actor, ContractQuery query, CancellationToken ct)
    {
        ViewRole(actor);
        // MVC binds empty query-string values to null; optional filters mean no restriction.
        query.Keyword ??= string.Empty;
        query.Status ??= string.Empty;
        query.AreaCode ??= string.Empty;
        query.ContractType ??= string.Empty;
        query.View ??= "all";
        if (query.Page < 1 || query.Page > 100000 || query.Size is < 1 or > 100 || query.Keyword.Length > 200)
        {
            throw new BusinessException("VALIDATION", 422);
        }

        string[] statuses = ["", "draft", "submitted", "under-review", "revision-requested", "rejected", "approved", "active", "cancelled"];
        if (!statuses.Contains(query.Status))
        {
            throw new BusinessException("VALIDATION", 422);
        }

        await using var c = await _db.Open(ct);
        var filter = Scope + """
            AND ($4 = '' OR c.title ILIKE '%' || $4 || '%' OR c.contract_code ILIKE '%' || $4 || '%' OR cu.customer_name ILIKE '%' || $4 || '%')
            AND ($5 = '' OR lower(regexp_replace(c.status::text, '([a-z])([A-Z])', '\1-\2', 'g')) = $5)
            AND ($6 = '' OR EXISTS(SELECT 1 FROM qtkd.contract_item ci JOIN qtkd.area a USING(area_id) WHERE ci.contract_id = c.contract_id AND a.area_code = $6))
            AND ($7 = '' OR c.contract_type = $7)
            """;

        var sql = $$"""
            WITH visible AS (
                SELECT c.*, cu.customer_name, u.full_name
                FROM qtkd.contract c
                JOIN qtkd.customer cu USING(customer_id)
                JOIN qtkd.user_account u ON u.user_id = c.owner_id
                WHERE {{filter}}
            ),
            page AS (
                SELECT * FROM visible
                ORDER BY updated_at DESC, contract_id
                LIMIT $8 OFFSET $9
            )
            SELECT jsonb_build_object(
                'total', (SELECT count(*) FROM visible),
                'items', coalesce((
                    SELECT jsonb_agg(jsonb_build_object(
                        'code', p.contract_code,
                        'title', p.title,
                        'contractType', p.contract_type,
                        'customerCode', cu.customer_code,
                        'customerName', p.customer_name,
                        'effectiveFrom', p.start_date,
                        'effectiveTo', p.end_date,
                        'status', lower(regexp_replace(p.status::text, '([a-z])([A-Z])', '\1-\2', 'g')),
                        'ownerName', p.full_name,
                        'updatedAt', p.updated_at,
                        'areaCodes', (
                            SELECT coalesce(jsonb_agg(DISTINCT a.area_code), '[]')
                            FROM qtkd.contract_item ci
                            JOIN qtkd.area a USING(area_id)
                            WHERE ci.contract_id = p.contract_id
                        )
                    ) ORDER BY p.updated_at DESC, p.contract_id)
                    FROM page p
                    JOIN qtkd.customer cu USING(customer_id)
                ), '[]')
            )
            """;

        var args = ScopeArgs(actor)
            .Concat([query.Keyword.Trim(), query.Status, query.AreaCode, query.ContractType, query.Size, (query.Page - 1) * query.Size])
            .ToArray();

        var result = (await Object(c, null, sql, ct, args))!;
        result["page"] = query.Page;
        result["size"] = query.Size;
        result["scope"] = actor.Role switch
        {
            "SalesStaff" => "own",
            "SalesManager" => "department",
            "LegalStaff" => "assigned",
            _ => "granted"
        };

        return result;
    }

    public async Task<StoredContract> Get(Actor actor, string code, CancellationToken ct)
    {
        ViewRole(actor);
        await using var c = await _db.Open(ct);
        return await Read(c, null, actor, code, false, ct);
    }

    private async Task<StoredContract> Read(NpgsqlConnection c, NpgsqlTransaction? tx, Actor actor, string code, bool locked, CancellationToken ct)
    {
        var json = await Object(c, tx, $$"""
            SELECT to_jsonb(c)
            FROM qtkd.contract c
            WHERE {{Scope}} AND c.contract_code = $4 {{(locked ? "FOR UPDATE OF c" : "")}}
            """, ct, ScopeArgs(actor).Concat([code]).ToArray()) ?? throw new BusinessException("NOT_FOUND", 404);

        var id = Guid.Parse(json["contract_id"]!.GetValue<string>());
        var owner = Guid.Parse(json["owner_id"]!.GetValue<string>());
        var department = json["owning_department_id"]?.GetValue<string>();
        var status = json["status"]!.GetValue<string>();

        var data = new JsonObject
        {
            ["code"] = code,
            ["title"] = json["title"]!.DeepClone(),
            ["contractType"] = json["contract_type"]!.DeepClone(),
            ["customerCode"] = "",
            ["customerName"] = "",
            ["sourceMode"] = json["source_mode"]!.DeepClone(),
            ["templateCode"] = json["template_code"]?.DeepClone() ?? JsonValue.Create(""),
            ["effectiveFrom"] = json["start_date"]!.DeepClone(),
            ["effectiveTo"] = json["end_date"]!.DeepClone(),
            ["value"] = json["contract_value"]!.DeepClone(),
            ["paymentTerm"] = json["payment_terms"]!.DeepClone(),
            ["content"] = json["content"]!.DeepClone(),
            ["status"] = ContractRules.ToClientStatus(status),
            ["ownerId"] = owner.ToString(),
            ["ownerName"] = "",
            ["departmentCode"] = department ?? "",
            ["createdAt"] = json["created_at"]!.DeepClone(),
            ["updatedAt"] = json["updated_at"]!.DeepClone(),
            ["version"] = json["version"]!.DeepClone(),
            ["customerSnapshot"] = json["customer_snapshot"]!.DeepClone()
        };

        var names = (await Object(c, tx, """
            SELECT jsonb_build_object(
                'customerCode', cu.customer_code,
                'customerName', cu.customer_name,
                'ownerName', u.full_name
            )
            FROM qtkd.customer cu
            JOIN qtkd.user_account u ON u.user_id = $2
            WHERE cu.customer_id = $1
            """, ct, Guid.Parse(json["customer_id"]!.GetValue<string>()), owner))!;

        foreach (var entry in names)
        {
            data[entry.Key] = entry.Value?.DeepClone();
        }

        data["services"] = await Array(c, tx, """
            SELECT coalesce(jsonb_agg(jsonb_build_object(
                'id', ci.item_id,
                'serviceCode', s.service_code,
                'serviceName', s.service_name,
                'unit', s.unit,
                'requiresArea', s.requires_area,
                'areaCode', coalesce(a.area_code, ''),
                'areaActive', a.status = 'Active'
            ) ORDER BY ci.item_id), '[]')
            FROM qtkd.contract_item ci
            JOIN qtkd.service s USING(service_id)
            LEFT JOIN qtkd.area a USING(area_id)
            WHERE ci.contract_id = $1
            """, ct, id);

        data["attachments"] = await Array(c, tx, """
            SELECT coalesce(jsonb_agg(jsonb_build_object(
                'id', attachment_id,
                'name', file_name,
                'size', file_size,
                'downloadUrl', '/api/v1/contracts/' || $2 || '/attachments/' || attachment_id
            ) ORDER BY uploaded_at), '[]')
            FROM qtkd.attachment
            WHERE contract_id = $1
            """, ct, id, code);

        data["rounds"] = await Rounds(c, tx, id, actor, ct);
        data["cancellationRequests"] = await CancellationRequests(c, tx, id, ct);

        if (json["cancelled_at"] is not null)
        {
            data["cancellation"] = await Object(c, tx, """
                SELECT jsonb_build_object(
                    'byName', u.full_name,
                    'at', c.cancelled_at,
                    'reason', c.cancellation_reason
                )
                FROM qtkd.contract c
                LEFT JOIN qtkd.user_account u ON u.user_id = c.cancelled_by
                WHERE c.contract_id = $1
                """, ct, id);
        }

        if (status is "RevisionRequested" or "Rejected")
        {
            data[status == "Rejected" ? "rejection" : "revisionRequest"] = await Object(c, tx, """
                SELECT jsonb_build_object(
                    'stepLabel', st.step_name,
                    'byName', u.full_name,
                    'at', st.decided_at,
                    'content', st.comment,
                    'reason', st.comment
                )
                FROM qtkd.approval_round ar
                JOIN qtkd.approval_step st USING(round_id)
                JOIN qtkd.user_account u ON u.user_id = st.decided_by
                WHERE ar.contract_id = $1 AND st.decision IN ('RequestRevision', 'Reject')
                ORDER BY st.decided_at DESC
                LIMIT 1
                """, ct, id);
        }

        data["history"] = await Array(c, tx, """
            SELECT coalesce(jsonb_agg(jsonb_build_object(
                'at', a.acted_at,
                'action', a.action,
                'byName', coalesce(a.value_after->'auditActor'->>'name', u.full_name),
                'note', a.note,
                'from', a.status_before,
                'to', a.status_after
            ) ORDER BY a.acted_at), '[]')
            FROM qtkd.audit_log a
            LEFT JOIN qtkd.user_account u ON u.user_id = a.actor_id
            WHERE a.entity_type = 'Contract' AND a.entity_id = $1
            """, ct, id);

        return new StoredContract(
            id,
            owner,
            department is null ? Guid.Empty : Guid.Parse(department),
            status,
            json["version"]!.GetValue<int>(),
            data);
    }

    private static async Task<JsonArray> Rounds(NpgsqlConnection c, NpgsqlTransaction? tx, Guid id, Actor actor, CancellationToken ct) =>
        await Array(c, tx, """
            SELECT coalesce(jsonb_agg(jsonb_build_object(
                'no', ar.round_no,
                'submittedById', ar.submitted_by,
                'submittedByName', u.full_name,
                'submittedAt', ar.submitted_at,
                'contractVersion', ar.record_version,
                'configCode', coalesce(ar.record_snapshot->>'configCode', ''),
                'configVersion', 1,
                'endedAt', ar.ended_at,
                'result', CASE ar.result
                    WHEN 'Running' THEN 'in-progress'
                    WHEN 'RevisionRequested' THEN 'revision'
                    ELSE lower(ar.result::text)
                END,
                'log', '[]'::jsonb,
                'coordinations', '[]'::jsonb,
                'steps', (
                    SELECT coalesce(jsonb_agg(jsonb_build_object(
                        'key', CASE config.stage_key
                            WHEN 'SalesManager' THEN 'sales'
                            WHEN 'sales' THEN 'sales'
                            WHEN 'LegalStaff' THEN 'legal'
                            WHEN 'legal' THEN 'legal'
                            ELSE 'board'
                        END,
                        'label', st.step_name,
                        'assigneeId', st.assignee_id,
                        'assigneeName', au.full_name,
                        'assignedAt', st.assigned_at,
                        'acceptedAt', st.accepted_at,
                        'state', CASE st.step_status
                            WHEN 'NotStarted' THEN CASE WHEN st.assignee_id IS NULL THEN 'unassigned' ELSE 'waiting' END
                            WHEN 'Pending' THEN 'pending-accept'
                            WHEN 'Reviewing' THEN 'reviewing'
                            WHEN 'Completed' THEN CASE WHEN st.decision = 'Approve' THEN 'done' ELSE 'stopped' END
                            ELSE 'skipped'
                        END,
                        'decision', CASE st.decision
                            WHEN 'Approve' THEN 'approve'
                            WHEN 'RequestRevision' THEN 'revision'
                            WHEN 'Reject' THEN 'reject'
                        END,
                        'decidedByName', du.full_name,
                        'decidedAt', st.decided_at,
                        'comment', CASE WHEN config.stage_key IN ('LegalStaff', 'legal') AND $2 NOT IN ('LegalStaff', 'LegalManager') THEN NULL ELSE st.comment END
                    ) ORDER BY st.step_order), '[]')
                    FROM qtkd.approval_step st
                    LEFT JOIN qtkd.user_account au ON au.user_id = st.assignee_id
                    LEFT JOIN LATERAL (
                        SELECT coalesce(
                            ar.record_snapshot->'workflow'->'stages'->(st.step_order - 1)->>'key',
                            ar.record_snapshot->'workflow'->'stages'->>(st.step_order - 1),
                            au.role::text
                        ) AS stage_key
                    ) config ON true
                    LEFT JOIN qtkd.user_account du ON du.user_id = st.decided_by
                    WHERE st.round_id = ar.round_id
                )
            ) ORDER BY ar.round_no), '[]')
            FROM qtkd.approval_round ar
            JOIN qtkd.user_account u ON u.user_id = ar.submitted_by
            WHERE ar.contract_id = $1
            """, ct, id, actor.Role);

    private async Task<JsonObject> Write(
        Actor actor,
        string operation,
        string key,
        object payload,
        Func<NpgsqlConnection, NpgsqlTransaction, Task<JsonObject>> action,
        CancellationToken ct)
    {
        var hash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(JsonSerializer.Serialize(payload, Json))));
        await using var c = await _db.Open(ct);
        await using var tx = await c.BeginTransactionAsync(ct);

        await Execute(c, tx, "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", ct, $"{actor.Id}:{operation}:{key}");

        var old = await Object(
            c,
            tx,
            "SELECT jsonb_build_object('fingerprint', fingerprint, 'response', response) FROM qtkd.idempotency_request WHERE actor_id = $1 AND operation = $2 AND key = $3",
            ct,
            actor.Id,
            operation,
            key);

        if (old is not null)
        {
            if (old["fingerprint"]!.GetValue<string>() != hash)
            {
                throw new BusinessException("IDEMPOTENCY_CONFLICT");
            }

            var response = old["response"]!.DeepClone().AsObject();
            response["replayed"] = true;

            if (response["contract"]?["code"] is JsonValue replayCode)
            {
                await Read(c, tx, actor, replayCode.GetValue<string>(), false, ct);
            }

            await tx.CommitAsync(ct);
            return response;
        }

        var result = await action(c, tx);
        await Execute(
            c,
            tx,
            "INSERT INTO qtkd.idempotency_request(actor_id, operation, key, fingerprint, response) VALUES($1, $2, $3, $4, $5)",
            ct,
            actor.Id,
            operation,
            key,
            hash,
            result);

        await tx.CommitAsync(ct);
        return result;
    }

    private static Task Audit(
        NpgsqlConnection c,
        NpgsqlTransaction tx,
        Actor actor,
        Guid id,
        string action,
        string? beforeStatus,
        string afterStatus,
        JsonObject? before,
        JsonObject after,
        string? note,
        CancellationToken ct)
    {
        var snapshot = after.DeepClone().AsObject();
        snapshot["auditActor"] = new JsonObject
        {
            ["id"] = actor.Id.ToString(),
            ["name"] = actor.Name,
            ["role"] = actor.Role,
            ["departmentId"] = actor.DepartmentId.ToString()
        };

        return Execute(c, tx, """
            INSERT INTO qtkd.audit_log(
                entity_type, entity_id, action, actor_id, status_before,
                status_after, value_before, value_after, note
            )
            VALUES('Contract', $1, $2, $3, $4, $5, $6, $7, $8)
            """, ct, id, action, actor.Id, beforeStatus, afterStatus, before, snapshot, note);
    }
}
