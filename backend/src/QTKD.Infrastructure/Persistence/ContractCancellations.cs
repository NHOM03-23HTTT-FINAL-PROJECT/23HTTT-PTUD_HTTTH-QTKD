using System.Text.Json.Nodes;
using Npgsql;
using QTKD.Application.Features.Contracts;
using QTKD.Domain.Contracts;
using static QTKD.Infrastructure.Persistence.PgDatabase;

namespace QTKD.Infrastructure.Persistence;

public partial class PostgresContractStore
{
    private static Task<JsonArray> CancellationRequests(NpgsqlConnection c, NpgsqlTransaction? tx, Guid id, CancellationToken ct) =>
        Array(c, tx, """
            SELECT coalesce(jsonb_agg(jsonb_build_object(
                'id', r.request_id,
                'party', r.party,
                'reason', r.reason,
                'status', r.status,
                'requestedByName', u.full_name,
                'requestedAt', r.requested_at,
                'version', r.version,
                'salesAssigneeId', r.sales_assignee_id,
                'salesAssigneeName', s.full_name,
                'salesApproved', r.sales_approved,
                'salesReason', r.sales_reason,
                'salesDecidedAt', r.sales_decided_at,
                'boardAssigneeId', r.board_assignee_id,
                'boardAssigneeName', b.full_name,
                'boardApproved', r.board_approved,
                'boardReason', r.board_reason,
                'boardDecidedAt', r.board_decided_at,
                'notificationStatus', (SELECT d.status FROM qtkd.contract_delivery d WHERE d.request_id = r.request_id)
            ) ORDER BY r.requested_at DESC), '[]')
            FROM qtkd.contract_cancellation_request r
            JOIN qtkd.user_account u ON u.user_id = r.requested_by
            JOIN qtkd.user_account s ON s.user_id = r.sales_assignee_id
            LEFT JOIN qtkd.user_account b ON b.user_id = r.board_assignee_id
            WHERE r.contract_id = $1
            """, ct, id);

    public Task<JsonObject> RequestCancellation(Actor actor, string code, CancellationDraft request, string key, CancellationToken ct) =>
        Write(actor, $"contracts:{code}:request-cancellation", key, request, async (c, tx) =>
        {
            var current = await Read(c, tx, actor, code, true, ct);
            ContractRules.RequireOwner(actor, current.OwnerId);
            ContractRules.RequireVersion(current.Version, request.BaseVersion);
            ContractRules.RequireCancellationRequest(current.Status, await HasSigned(c, tx, current.Id, ct));
            await NoPendingCancellation(c, tx, current.Id, ct);

            var reason = ContractValidator.Reason(request.Reason);
            if (request.Party is not ("company" or "customer"))
            {
                throw new BusinessException("VALIDATION", 422);
            }

            var people = await Object(c, tx, """
                SELECT jsonb_build_object('sales', s.user_id, 'board', b.user_id)
                FROM qtkd.department d
                JOIN qtkd.user_account s ON s.user_id = d.manager_id AND s.role = 'SalesManager' AND s.status = 'Active'
                LEFT JOIN LATERAL (
                    SELECT u.user_id
                    FROM qtkd.user_account u
                    JOIN qtkd.department bd ON bd.manager_id = u.user_id
                    WHERE u.role IN ('BoardMember', 'BoardChair') AND u.status = 'Active'
                    ORDER BY u.user_id
                    LIMIT 1
                ) b ON true
                WHERE d.department_id = $1
                """, ct, current.DepartmentId) ?? throw new BusinessException("NO_APPROVER");

            if (current.Status == "Approved" && people["board"] is null)
            {
                throw new BusinessException("NO_APPROVER");
            }

            var sales = Guid.Parse(people["sales"]!.GetValue<string>());
            Guid? board = current.Status == "Approved" ? Guid.Parse(people["board"]!.GetValue<string>()) : null;

            if (sales == actor.Id || board == actor.Id)
            {
                throw new BusinessException("NO_APPROVER");
            }

            var requestId = Guid.NewGuid();
            await Execute(c, tx, """
                INSERT INTO qtkd.contract_cancellation_request(
                    request_id, contract_id, requested_by, party, reason,
                    original_status, contract_version, sales_assignee_id, board_assignee_id
                )
                VALUES($1, $2, $3, $4, $5, $6::qtkd.contract_status, $7, $8, $9)
                """, ct, requestId, current.Id, actor.Id, request.Party, reason, current.Status, current.Version, sales, board);

            await Notify(c, tx, current.Id, sales, $"Đề nghị hủy {code}: {reason}", ct);

            var next = await Read(c, tx, actor, code, false, ct);
            await Audit(c, tx, actor, current.Id, "CANCELLATION_REQUESTED", current.Status, current.Status, current.Data, next.Data, reason, ct);

            return new JsonObject
            {
                ["contract"] = next.Data,
                ["replayed"] = false
            };
        }, ct);

    public Task<JsonObject> DecideCancellation(
        Actor actor,
        string code,
        Guid requestId,
        CancellationDecision request,
        string key,
        CancellationToken ct) =>
        Write(actor, $"contracts:{code}:cancellation:{requestId}:decide", key, request, async (c, tx) =>
        {
            var current = await Read(c, tx, actor, code, true, ct);
            var pending = await Object(
                c,
                tx,
                "SELECT to_jsonb(r) FROM qtkd.contract_cancellation_request r WHERE contract_id = $1 AND request_id = $2 FOR UPDATE",
                ct,
                current.Id,
                requestId) ?? throw new BusinessException("NOT_FOUND", 404);

            var stage = pending["status"]!.GetValue<string>();
            var sales = stage == "pending-sales";
            if (stage is not ("pending-sales" or "pending-board"))
            {
                throw new BusinessException("STEP_DONE");
            }

            var assignee = Guid.Parse(pending[sales ? "sales_assignee_id" : "board_assignee_id"]!.GetValue<string>());
            if (actor.Id != assignee ||
                (sales ? actor.Role != "SalesManager" : actor.Role is not ("BoardMember" or "BoardChair")) ||
                (sales && actor.ManagedDepartmentId != current.DepartmentId))
            {
                throw new BusinessException("NOT_ASSIGNEE", 403);
            }

            ContractRules.RequireVersion(pending["version"]!.GetValue<int>(), request.BaseVersion);
            if (current.Status != pending["original_status"]!.GetValue<string>() ||
                current.Version != pending["contract_version"]!.GetValue<int>())
            {
                throw new BusinessException("CONFLICT");
            }

            var reason = request.Approve ? (request.Reason ?? "").Trim() : ContractValidator.Reason(request.Reason);
            if (reason.Length > 4000)
            {
                throw new BusinessException("VALIDATION", 422);
            }

            var needsBoard = sales && pending["board_assignee_id"] is not null;
            var finished = request.Approve && !needsBoard;

            if (finished)
            {
                ContractRules.RequireCancellationRequest(current.Status, await HasSigned(c, tx, current.Id, ct));

                // Real provider sessions must be cancelled by the signing integration before the contract can be cancelled.
                var signing = await Object(
                    c,
                    tx,
                    "SELECT jsonb_build_object('id', signing_session_id) FROM qtkd.signing_session WHERE contract_id = $1 AND status = 'Signing' FOR UPDATE",
                    ct,
                    current.Id);

                if (signing is not null)
                {
                    throw new BusinessException("SIGNING_CANCELLATION_REQUIRED");
                }
            }

            var nextStatus = !request.Approve ? "rejected" : needsBoard ? "pending-board" : "approved";
            var decisionSql = sales
                ? "UPDATE qtkd.contract_cancellation_request SET sales_approved = $2, sales_reason = $3, sales_decided_at = now(), status = $4, version = version + 1 WHERE request_id = $1"
                : "UPDATE qtkd.contract_cancellation_request SET board_approved = $2, board_reason = $3, board_decided_at = now(), status = $4, version = version + 1 WHERE request_id = $1";

            await Execute(c, tx, decisionSql, ct, requestId, request.Approve, reason, nextStatus);

            if (finished)
            {
                await CancelRecord(c, tx, current.Id, actor.Id, pending["reason"]!.GetValue<string>(), ct);

                // Stop running rounds without rewriting the completed decision history.
                await Execute(c, tx, "UPDATE qtkd.approval_round SET result = 'Withdrawn', ended_at = now() WHERE contract_id = $1 AND result = 'Running'", ct, current.Id);

                await Execute(c, tx, """
                    INSERT INTO qtkd.notification(recipient_id, record_type, record_id, content)
                    SELECT DISTINCT st.assignee_id, 'Contract'::qtkd.record_type, $1, $2
                    FROM qtkd.approval_round ar
                    JOIN qtkd.approval_step st USING(round_id)
                    WHERE ar.contract_id = $1 AND st.step_status IN ('Pending', 'Reviewing')
                    """, ct, current.Id, $"Hồ sơ {code} đã hủy. Dừng rà soát và phê duyệt.");
            }

            if (nextStatus == "pending-board")
            {
                await Notify(c, tx, current.Id, Guid.Parse(pending["board_assignee_id"]!.GetValue<string>()), $"Đề nghị hủy {code} chờ Ban Giám đốc quyết định.", ct);
            }

            if (nextStatus is "approved" or "rejected")
            {
                await Notify(c, tx, current.Id, current.OwnerId, $"Đề nghị hủy {code}: {(finished ? "được chấp thuận" : "không được chấp thuận")}. {reason}", ct);

                var snapshot = current.Data["customerSnapshot"];
                await Execute(c, tx, """
                    INSERT INTO qtkd.contract_delivery(delivery_id, contract_id, request_id, destination, payload, status)
                    VALUES($1, $2, $3, $4, $5, CASE WHEN $4 = '' THEN 'Failed' ELSE 'Pending' END)
                    """, ct, Guid.NewGuid(), current.Id, requestId, snapshot?["email"]?.GetValue<string>() ?? "",
                    new JsonObject
                    {
                        ["contractCode"] = code,
                        ["result"] = nextStatus,
                        ["reason"] = reason
                    });
            }

            var next = await Read(c, tx, actor, code, false, ct);
            await Audit(c, tx, actor, current.Id, "CANCELLATION_DECIDED", current.Status, finished ? "Cancelled" : current.Status, current.Data, next.Data, reason, ct);

            return new JsonObject
            {
                ["contract"] = next.Data,
                ["replayed"] = false
            };
        }, ct);

    private static async Task<bool> HasSigned(NpgsqlConnection c, NpgsqlTransaction tx, Guid id, CancellationToken ct) =>
        await Object(
            c,
            tx,
            "SELECT jsonb_build_object('id', signing_session_id) FROM qtkd.signing_session WHERE contract_id = $1 AND (status = 'Succeeded' OR company_signed_at IS NOT NULL OR customer_signed_at IS NOT NULL) LIMIT 1",
            ct,
            id) is not null;

    private static Task Notify(NpgsqlConnection c, NpgsqlTransaction tx, Guid id, Guid recipient, string content, CancellationToken ct) =>
        Execute(c, tx, "INSERT INTO qtkd.notification(recipient_id, record_type, record_id, content) VALUES($1, 'Contract', $2, $3)", ct, recipient, id, content);
}
