using Npgsql;
using QTKD.Application.Features.Customers;

namespace QTKD.Infrastructure.Customers;

// A source is trusted server-side infrastructure, never request-supplied data.
// Successful reviews must cover the necessary records and protect their freshness
// through the transaction; missing sources cannot be represented as empty lists.
public interface ICustomerStatusSource
{
    Task<SuspensionReview> Suspension(NpgsqlConnection connection, NpgsqlTransaction transaction,
        Guid customerId, Guid actorId, CancellationToken cancellationToken);
    Task<ReactivationSourceResult> Reactivation(NpgsqlConnection connection, NpgsqlTransaction transaction,
        Guid customerId, Guid actorId, string? reasonGroup, StatusException? exception, CancellationToken cancellationToken);
}

public sealed record ReactivationSourceResult(bool Complete, bool Allowed, string[] MissingSources,
    ReactivationCheck[] Checks, string? VerifiedBasis);

// Contract data is available from main. Other sources do not yet expose a
// verified completeness contract, so this provider must never authorize a write.
public sealed class PostgresCustomerStatusSource : ICustomerStatusSource
{
    public async Task<SuspensionReview> Suspension(NpgsqlConnection connection, NpgsqlTransaction transaction,
        Guid customerId, Guid actorId, CancellationToken cancellationToken)
    {
        string? role = null; Guid department = Guid.Empty; var permitted = false;
        await using (var actor = new NpgsqlCommand("""
            SELECT u.role::text,u.department_id,EXISTS(SELECT 1 FROM qtkd.role_permission p
              WHERE p.role=u.role AND p.permission_code='contracts.view')
            FROM qtkd.user_account u WHERE u.user_id=@actor AND u.status='Active'
            """, connection, transaction))
        {
            actor.Parameters.AddWithValue("actor", actorId);
            await using var reader = await actor.ExecuteReaderAsync(cancellationToken);
            if (await reader.ReadAsync(cancellationToken)) { role = reader.GetString(0); department = reader.GetGuid(1); permitted = reader.GetBoolean(2); }
        }
        var failed = new List<string> { "job", "service", "approval" };
        var items = new List<StatusImpactItem>();
        if (!permitted || role is not ("SalesManager" or "SalesStaff")) failed.Insert(0, "contract");
        else
        {
            var incomplete = false; var count = 0;
            await using var cmd = new NpgsqlCommand("""
                SELECT c.contract_id,c.contract_code,c.title,c.status::text,c.end_date,
                  ((@role='SalesManager' AND c.owning_department_id=@department) OR (@role='SalesStaff' AND c.owner_id=@actor))
                FROM qtkd.contract c WHERE c.customer_id=@customer AND c.document_type='Contract'
                  AND c.status IN ('Active','Approved') ORDER BY c.contract_code LIMIT 101 FOR SHARE OF c
                """, connection, transaction);
            cmd.Parameters.AddWithValue("role", role); cmd.Parameters.AddWithValue("department", department);
            cmd.Parameters.AddWithValue("actor", actorId); cmd.Parameters.AddWithValue("customer", customerId);
            await using var reader = await cmd.ExecuteReaderAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken))
            {
                count++;
                if (count > 100 || reader.IsDBNull(5) || !reader.GetBoolean(5)) { incomplete = true; continue; }
                var status = reader.GetString(3);
                items.Add(new StatusImpactItem("contract:" + reader.GetGuid(0), "contract", "Còn hiệu lực hoặc đã duyệt",
                    reader.GetString(1), reader.GetString(2), "Hiệu lực đến " + reader.GetDateTime(4).ToString("dd/MM/yyyy"),
                    status, status == "Active" ? "success" : "info", "Kinh doanh",
                    ["Giữ nguyên trạng thái hợp đồng", "Rà soát điều khoản"], "Không tự đổi trạng thái hợp đồng"));
            }
            if (incomplete) failed.Insert(0, "contract");
        }
        return new SuspensionReview(items.ToArray(), failed.ToArray(), null,
            ["operations", "unbilled_services", "approval", "debt", "disputes"]);
    }

    public Task<ReactivationSourceResult> Reactivation(NpgsqlConnection connection, NpgsqlTransaction transaction,
        Guid customerId, Guid actorId, string? reasonGroup, StatusException? exception, CancellationToken cancellationToken)
    {
        var checks = reasonGroup switch
        {
            "CONG_NO" => new[] { new ReactivationCheck("debt", "Công nợ", "unknown", "Chưa có xác nhận từ Kế toán") },
            "TRANH_CHAP" or "VI_PHAM_HD" => new[] { new ReactivationCheck("dispute", "Tranh chấp và điều khoản", "unknown", "Chưa có xác nhận của bộ phận phụ trách") },
            "VAN_HANH" => new[] { new ReactivationCheck("operation", "Vận hành", "unknown", "Chưa có xác nhận từ Khai thác") },
            _ => new[] { new ReactivationCheck("operation", "Căn cứ tiếp tục hợp tác", "unknown", "Chưa xác minh được điều kiện theo lý do tạm ngưng") }
        };
        return Task.FromResult(new ReactivationSourceResult(false, false, ["authoritative_confirmation"], checks, null));
    }
}
