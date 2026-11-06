using QTKD.Application.Common.Interfaces;
using QTKD.Application.Features.Customers;
using System.Security.Cryptography;
using System.Text.Json;
using Microsoft.Extensions.Configuration;

namespace QTKD.Infrastructure.Customers;

// A source is trusted server-side infrastructure, never request-supplied data.
// Successful reviews must cover the necessary records and protect their freshness
// through the transaction; missing sources cannot be represented as empty lists.
// Authoritative confirmations are not integrated. The provider reports that dependency
// explicitly and never treats a browser-supplied exception as a verified decision.
public sealed class PostgresCustomerStatusSource(ICustomerRepository repository, IConfiguration configuration) : ICustomerStatusSource
{
    public async Task<SuspensionSourceResult> Suspension(Guid customerId, Guid actorId, bool forConfirmation, CancellationToken ct)
    {
        var snapshot = await repository.SuspensionSnapshot(customerId, actorId, forConfirmation, ct);
        var items = new List<SuspensionImpact>();
        var failed = new HashSet<string> { "job", "service" };
        var missing = new List<string> { "operations_jobs", "unbilled_services" };
        foreach (var c in snapshot.Contracts.Where(c => c.Status is "Active" or "Approved"))
        {
            if (!c.Visible) { failed.Add("contract"); missing.Add("restricted_contracts"); continue; }
            items.Add(new("contract:" + c.Id, "contract", "Còn hiệu lực hoặc đã duyệt", c.Code, c.Code + " · " + c.Title,
                "Hợp đồng giữ nguyên trạng thái sau tạm ngưng.", c.Status, "info", "Pháp chế",
                ["Giữ nguyên; phối hợp xử lý theo điều khoản", "Chuyển Pháp chế rà soát"], "Không tự hủy hoặc sửa hợp đồng."));
        }
        foreach (var r in snapshot.Approvals)
        {
            var c = snapshot.Contracts.Single(c => c.Id == r.ContractId);
            if (!c.Visible) { failed.Add("approval"); missing.Add("restricted_approvals"); continue; }
            items.Add(new("approval:" + r.Id, "approval", "Đang phê duyệt", c.Code, c.Code + " · Lượt duyệt " + r.RoundNo,
                "Lượt duyệt hiện có giữ nguyên; Kinh doanh phối hợp người đang xử lý.", "Đang duyệt", "warning", "Kinh doanh",
                ["Tiếp tục xử lý hồ sơ hiện có", "Phối hợp người phụ trách rà soát"], "Không tự kết thúc lượt duyệt."));
        }
        if (snapshot.HasPaymentApprovals) { failed.Add("approval"); missing.Add("payment_approval_review"); }
        // Schema alone cannot prove that these unfinished modules contain all work.
        // Keep their absence explicit; never manufacture zero jobs or unbilled services.
        var departments = configuration.GetSection("Customers:SuspensionNotifications:Departments").Get<string[]>() ?? [];
        var knownDepartments = new[] { "Kinh doanh", "Khai thác", "Kế toán", "Pháp chế" };
        if (departments.Any(d => !knownDepartments.Contains(d)))
            throw new InvalidOperationException("Invalid customer suspension notification department.");
        var fingerprint = Convert.ToHexString(SHA256.HashData(JsonSerializer.SerializeToUtf8Bytes(snapshot)));
        return new(false, items.ToArray(), failed.Order().ToArray(), missing.Distinct().Order().ToArray(),
            fingerprint, departments.Distinct().Order().ToArray());
    }

    public Task<ReactivationSourceResult> Reactivation(Guid customerId, Guid actorId, string? reasonGroup,
        StatusException? exception, CancellationToken cancellationToken)
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
