using System.Globalization;
using System.Text.Json.Nodes;
using Npgsql;
using QTKD.Application.Features.Contracts;
using QTKD.Domain.Contracts;
using static QTKD.Infrastructure.Persistence.PgDatabase;

namespace QTKD.Infrastructure.Persistence;

public partial class PostgresContractStore
{
    public Task<JsonObject> Create(Actor actor, ContractDraft draft, decimal value, string key, CancellationToken ct) =>
        Write(actor, "contracts:create", key, draft, async (c, tx) =>
        {
            if (!actor.IsSalesStaff)
            {
                throw new BusinessException("FORBIDDEN", 403);
            }

            var customer = await References(c, tx, draft, ct);
            var id = Guid.NewGuid();

            var created = (await Object(c, tx, """
                INSERT INTO qtkd.contract(
                    contract_id, document_type, customer_id, title, contract_type,
                    start_date, end_date, contract_value, payment_terms, content,
                    status, owner_id, owning_department_id, source_mode, template_code, customer_snapshot
                )
                VALUES($1, 'Contract', $2, $3, $4, $5, $6, $7, $8, $9, 'Draft', $10, $11, $12, $13, $14)
                RETURNING jsonb_build_object('code', contract_code)
                """,
                ct,
                id,
                Guid.Parse(customer["id"]!.GetValue<string>()),
                draft.Title.Trim(),
                draft.ContractType.Trim(),
                DateOnly.ParseExact(draft.EffectiveFrom, "yyyy-MM-dd", CultureInfo.InvariantCulture),
                DateOnly.ParseExact(draft.EffectiveTo, "yyyy-MM-dd", CultureInfo.InvariantCulture),
                value,
                draft.PaymentTerm.Trim(),
                draft.Content.Trim(),
                actor.Id,
                actor.DepartmentId,
                draft.SourceMode,
                draft.SourceMode == "template" ? draft.TemplateCode : null,
                customer))!;

            await SaveItems(c, tx, id, draft.Services, ct);

            var next = await Read(c, tx, actor, created["code"]!.GetValue<string>(), false, ct);
            await Audit(c, tx, actor, id, "CONTRACT_CREATED", null, "Draft", null, next.Data, null, ct);

            return new JsonObject
            {
                ["contract"] = next.Data,
                ["replayed"] = false
            };
        }, ct);

    public async Task<JsonObject> Update(Actor actor, string code, UpdateContract request, decimal value, CancellationToken ct)
    {
        await using var c = await _db.Open(ct);
        await using var tx = await c.BeginTransactionAsync(ct);

        var current = await Read(c, tx, actor, code, true, ct);
        ContractRules.RequireOwner(actor, current.OwnerId);
        ContractRules.RequireEditable(current.Status);
        ContractRules.RequireVersion(current.Version, request.BaseVersion);
        await NoPendingCancellation(c, tx, current.Id, ct);

        var draft = request.Draft;
        var customer = await References(c, tx, draft, ct);

        await Execute(c, tx, """
            UPDATE qtkd.contract
            SET customer_id = $2,
                title = $3,
                contract_type = $4,
                start_date = $5,
                end_date = $6,
                contract_value = $7,
                payment_terms = $8,
                content = $9,
                source_mode = $10,
                template_code = $11,
                customer_snapshot = $12,
                version = version + 1
            WHERE contract_id = $1
            """,
            ct,
            current.Id,
            Guid.Parse(customer["id"]!.GetValue<string>()),
            draft.Title.Trim(),
            draft.ContractType.Trim(),
            DateOnly.ParseExact(draft.EffectiveFrom, "yyyy-MM-dd", CultureInfo.InvariantCulture),
            DateOnly.ParseExact(draft.EffectiveTo, "yyyy-MM-dd", CultureInfo.InvariantCulture),
            value,
            draft.PaymentTerm.Trim(),
            draft.Content.Trim(),
            draft.SourceMode,
            draft.SourceMode == "template" ? draft.TemplateCode : null,
            customer);

        await SaveItems(c, tx, current.Id, draft.Services, ct);

        var next = await Read(c, tx, actor, code, false, ct);
        await Audit(c, tx, actor, current.Id, "CONTRACT_UPDATED", current.Status, current.Status, current.Data, next.Data, null, ct);

        await tx.CommitAsync(ct);
        return next.Data;
    }

    public Task<JsonObject> Cancel(Actor actor, string code, CancelContract request, string key, CancellationToken ct) =>
        Write(actor, $"contracts:{code}:cancel", key, request, async (c, tx) =>
        {
            var current = await Read(c, tx, actor, code, true, ct);
            ContractRules.RequireOwner(actor, current.OwnerId);

            if (current.Status != "Draft")
            {
                throw new BusinessException("STATUS", 409, new
                {
                    status = ContractRules.ToClientStatus(current.Status)
                });
            }

            ContractRules.RequireVersion(current.Version, request.BaseVersion);
            var reason = ContractValidator.Reason(request.Reason);

            await CancelRecord(c, tx, current.Id, actor.Id, reason, ct);

            var next = await Read(c, tx, actor, code, false, ct);
            await Audit(c, tx, actor, current.Id, "CONTRACT_CANCELLED", current.Status, "Cancelled", current.Data, next.Data, reason, ct);

            return new JsonObject
            {
                ["contract"] = next.Data,
                ["replayed"] = false
            };
        }, ct);

    private static Task CancelRecord(NpgsqlConnection c, NpgsqlTransaction tx, Guid id, Guid by, string reason, CancellationToken ct) =>
        Execute(
            c,
            tx,
            "UPDATE qtkd.contract SET status = 'Cancelled', cancelled_by = $2, cancelled_at = now(), cancellation_reason = $3, version = version + 1 WHERE contract_id = $1",
            ct,
            id,
            by,
            reason);

    private static async Task<JsonObject> References(NpgsqlConnection c, NpgsqlTransaction tx, ContractDraft draft, CancellationToken ct)
    {
        if (draft.SourceMode == "template" && draft.TemplateCode != "MHD-THAM-KHAO-01")
        {
            throw new BusinessException("VALIDATION", 422, new
            {
                fieldErrors = new
                {
                    templateCode = "Mẫu hợp đồng không còn hợp lệ."
                }
            });
        }

        var customer = await Object(c, tx, """
            SELECT jsonb_build_object(
                'id', customer_id,
                'code', customer_code,
                'name', customer_name,
                'taxCode', tax_code,
                'address', address,
                'representative', legal_representative,
                'contactName', contact_name,
                'phone', phone,
                'email', email
            )
            FROM qtkd.customer
            WHERE customer_code = $1 AND status = 'Active'
            FOR SHARE
            """, ct, draft.CustomerCode) ?? throw new BusinessException("CUSTOMER_INACTIVE", 409, new
        {
            fieldErrors = new
            {
                customerCode = "Khách hàng không còn ở trạng thái Hoạt động."
            }
        });

        // Lock catalog rows through the transaction; client labels and requiresArea are never trusted.
        foreach (var item in draft.Services.OrderBy(s => s.ServiceCode, StringComparer.Ordinal))
        {
            var service = await Object(
                c,
                tx,
                "SELECT jsonb_build_object('requiresArea', requires_area) FROM qtkd.service WHERE service_code = $1 FOR SHARE",
                ct,
                item.ServiceCode);

            if (service is null)
            {
                throw new BusinessException("VALIDATION", 422, new
                {
                    fieldErrors = new
                    {
                        services = "Dịch vụ không tồn tại."
                    }
                });
            }

            if (service["requiresArea"]!.GetValue<bool>() && string.IsNullOrWhiteSpace(item.AreaCode))
            {
                throw new BusinessException("VALIDATION", 422, new
                {
                    fieldErrors = new
                    {
                        serviceAreas = new Dictionary<string, string> { { item.Id, "Chọn khu vực đang Hoạt động." } }
                    }
                });
            }

            if (!string.IsNullOrWhiteSpace(item.AreaCode))
            {
                var areas = await Array(c, tx, """
                    WITH RECURSIVE chain AS (
                        SELECT area_id, parent_area_id FROM qtkd.area WHERE area_code = $1
                        UNION
                        SELECT a.area_id, a.parent_area_id FROM qtkd.area a JOIN chain x ON a.area_id = x.parent_area_id
                    )
                    SELECT coalesce(jsonb_agg(locked.data), '[]')
                    FROM (
                        SELECT jsonb_build_object('status', a.status) AS data
                        FROM qtkd.area a
                        JOIN chain x USING(area_id)
                        ORDER BY a.area_id
                        FOR SHARE OF a
                    ) locked
                    """, ct, item.AreaCode);

                if (areas.Count == 0 || areas.Any(a => a!["status"]!.GetValue<string>() != "Active"))
                {
                    throw new BusinessException("AREA_INACTIVE", 409, new
                    {
                        fieldErrors = new
                        {
                            serviceAreas = new Dictionary<string, string> { { item.Id, "Khu vực hoặc khu vực cha đã Tạm ngưng." } }
                        },
                        items = new[] { item.ServiceName }
                    });
                }
            }
        }

        return customer;
    }

    private static async Task SaveItems(NpgsqlConnection c, NpgsqlTransaction tx, Guid contractId, ServiceDraft[] items, CancellationToken ct)
    {
        await Execute(c, tx, "DELETE FROM qtkd.contract_item WHERE contract_id = $1", ct, contractId);
        foreach (var item in items)
        {
            await Execute(c, tx, """
                INSERT INTO qtkd.contract_item(contract_id, service_id, area_id, area_name_snapshot)
                SELECT $1, s.service_id, a.area_id, coalesce(a.area_name, '')
                FROM qtkd.service s
                LEFT JOIN qtkd.area a ON a.area_code = $3
                WHERE s.service_code = $2
                """, ct, contractId, item.ServiceCode, item.AreaCode);
        }
    }

    private static async Task NoPendingCancellation(NpgsqlConnection c, NpgsqlTransaction tx, Guid id, CancellationToken ct)
    {
        var pending = await Object(
            c,
            tx,
            "SELECT jsonb_build_object('id', request_id) FROM qtkd.contract_cancellation_request WHERE contract_id = $1 AND status IN ('pending-sales', 'pending-board')",
            ct,
            id);

        if (pending is not null)
        {
            throw new BusinessException("CANCELLATION_PENDING");
        }
    }
}
