using System.Text.Json.Nodes;
using Npgsql;
using QTKD.Application.Features.Contracts;
using QTKD.Domain.Contracts;
using static QTKD.Infrastructure.Persistence.PgDatabase;

namespace QTKD.Infrastructure.Persistence;

/// <summary>SYS-CTR-04 · Trình duyệt hợp đồng: kiểm tra hồ sơ, tạo lượt duyệt và giao bước đầu cho Trưởng phòng KD.</summary>
public partial class PostgresContractStore
{
    public async Task<JsonObject> SubmitCheck(Actor actor, string code, CancellationToken ct)
    {
        await using var c = await _db.Open(ct);
        var current = await Read(c, null, actor, code, false, ct);
        var reviewer = await CheckSubmit(c, null, actor, current, ct);

        return new JsonObject
        {
            ["salesReviewer"] = reviewer["name"]!.DeepClone(),
            ["resubmit"] = current.Status == "RevisionRequested"
        };
    }

    public Task<JsonObject> Submit(Actor actor, string code, string key, CancellationToken ct) =>
        Write(actor, $"contracts:{code}:submit", key, new { code }, async (c, tx) =>
        {
            var current = await Read(c, tx, actor, code, true, ct);
            var reviewer = await CheckSubmit(c, tx, actor, current, ct);
            var reviewerId = Guid.Parse(reviewer["id"]!.GetValue<string>());

            // Status changes keep the content version (202611030005), so the round pins the submitted content.
            await Execute(c, tx, "UPDATE qtkd.contract SET status = 'Submitted' WHERE contract_id = $1", ct, current.Id);

            var roundId = Guid.NewGuid();
            var round = (await Object(c, tx, """
                INSERT INTO qtkd.approval_round(
                    round_id, record_type, contract_id, record_version, round_no, submitted_by, record_snapshot
                )
                SELECT $1, 'Contract', c.contract_id, c.version,
                    (SELECT coalesce(max(round_no), 0) + 1 FROM qtkd.approval_round WHERE contract_id = c.contract_id),
                    $2,
                    jsonb_build_object(
                        'contractId', c.contract_id,
                        'code', c.contract_code,
                        'title', c.title,
                        'customer', c.customer_snapshot,
                        'contractValue', c.contract_value,
                        'version', c.version,
                        'items', (SELECT coalesce(jsonb_agg(to_jsonb(i)), '[]') FROM qtkd.contract_item i WHERE i.contract_id = c.contract_id),
                        'workflow', jsonb_build_object('version', 1, 'stages', jsonb_build_array('SalesManager', 'LegalStaff', 'BoardMember'))
                    )
                FROM qtkd.contract c
                WHERE c.contract_id = $3
                RETURNING jsonb_build_object('no', round_no)
                """, ct, roundId, actor.Id, current.Id))!;

            // The approval module requires all three steps; legal and board wait for assignment.
            await Execute(c, tx, """
                INSERT INTO qtkd.approval_step(round_id, step_name, step_order, assignee_id, assigned_at, step_status)
                VALUES($1, 'Rà soát kinh doanh', 1, $2, now(), 'Pending'),
                      ($1, 'Rà soát pháp lý', 2, NULL, NULL, 'NotStarted'),
                      ($1, 'Phê duyệt', 3, NULL, NULL, 'NotStarted')
                """, ct, roundId, reviewerId);

            var title = current.Data["title"]!.GetValue<string>();
            await Execute(c, tx, """
                INSERT INTO qtkd.notification(recipient_id, record_type, record_id, content)
                VALUES($1, 'Contract', $2, $3)
                """, ct, reviewerId, current.Id, $"Hồ sơ {code} – {title} cần Rà soát kinh doanh.");

            var next = await Read(c, tx, actor, code, false, ct);
            var no = round["no"]!.GetValue<int>();
            await Audit(c, tx, actor, current.Id, "CONTRACT_SUBMITTED", current.Status, "Submitted", current.Data, next.Data,
                current.Status == "RevisionRequested" ? $"Trình lại, lượt {no}" : $"Lượt {no}", ct);

            return new JsonObject
            {
                ["contract"] = next.Data,
                ["replayed"] = false
            };
        }, ct);

    /// <summary>Bước 3–4 và E1–E5; trả về Trưởng phòng KD quản lý phòng sở hữu hồ sơ.</summary>
    private static async Task<JsonObject> CheckSubmit(NpgsqlConnection c, NpgsqlTransaction? tx, Actor actor, StoredContract current, CancellationToken ct)
    {
        ContractRules.RequireOwner(actor, current.OwnerId);
        ContractRules.RequireEditable(current.Status);
        if (tx is not null)
        {
            await NoPendingCancellation(c, tx, current.Id, ct);
        }

        var missing = new List<string>();
        var services = current.Data["services"]!.AsArray();
        if (services.Count == 0)
        {
            missing.Add("Ít nhất một hạng mục dịch vụ");
        }

        missing.AddRange(services
            .Where(s => s!["requiresArea"]!.GetValue<bool>() && string.IsNullOrEmpty(s["areaCode"]!.GetValue<string>()))
            .Select(s => $"Khu vực thực hiện của \"{s!["serviceName"]!.GetValue<string>()}\""));

        if (current.Data["attachments"]!.AsArray().Count == 0)
        {
            missing.Add("Tệp hợp đồng hoặc tài liệu đính kèm (ít nhất 1 tệp)");
        }

        if (missing.Count > 0)
        {
            throw new BusinessException("MISSING", 409, new { items = missing });
        }

        // An area is unusable when it or any ancestor is no longer Active.
        var suspended = await Array(c, tx, """
            SELECT coalesce(jsonb_agg(s.service_name || ' · ' || a.area_code ORDER BY ci.item_id), '[]')
            FROM qtkd.contract_item ci
            JOIN qtkd.service s USING(service_id)
            JOIN qtkd.area a USING(area_id)
            WHERE ci.contract_id = $1 AND EXISTS (
                WITH RECURSIVE chain AS (
                    SELECT area_id, parent_area_id, status FROM qtkd.area WHERE area_id = ci.area_id
                    UNION
                    SELECT p.area_id, p.parent_area_id, p.status FROM qtkd.area p JOIN chain x ON p.area_id = x.parent_area_id
                )
                SELECT 1 FROM chain WHERE status <> 'Active'
            )
            """, ct, current.Id);

        if (suspended.Count > 0)
        {
            throw new BusinessException("AREA_INACTIVE", 409, new { items = suspended });
        }

        return await Object(c, tx, $$"""
            SELECT jsonb_build_object('id', m.user_id, 'name', m.full_name)
            FROM qtkd.contract c
            JOIN qtkd.user_account o ON o.user_id = c.owner_id
            JOIN qtkd.department d ON d.department_id = coalesce(c.owning_department_id, o.department_id)
            JOIN qtkd.user_account m ON m.user_id = d.manager_id
            JOIN qtkd.role_permission p ON p.role = m.role AND p.permission_code = 'approvals.approve'
            WHERE c.contract_id = $1 AND m.role = 'SalesManager' AND m.status = 'Active'
              AND NOT m.must_change_password AND m.user_id <> c.owner_id
            {{(tx is null ? "" : "FOR SHARE OF m, p")}}
            """, ct, current.Id) ?? throw new BusinessException("NO_APPROVER", 409);
    }
}
