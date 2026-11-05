using Npgsql;
using QTKD.Application.Features.Customers;

namespace QTKD.Infrastructure.Customers;

// A source is trusted server-side infrastructure, never request-supplied data.
// Successful reviews must cover the necessary records and protect their freshness
// through the transaction; missing sources cannot be represented as empty lists.
public interface ICustomerStatusSource
{
    Task<ReactivationSourceResult> Reactivation(NpgsqlConnection connection, NpgsqlTransaction transaction,
        Guid customerId, Guid actorId, string? reasonGroup, StatusException? exception, CancellationToken cancellationToken);
}

public sealed record ReactivationSourceResult(bool Complete, bool Allowed, string[] MissingSources,
    ReactivationCheck[] Checks, string? VerifiedBasis);

// Authoritative confirmations are not integrated. The provider reports that dependency
// explicitly and never treats a browser-supplied exception as a verified decision.
public sealed class PostgresCustomerStatusSource : ICustomerStatusSource
{
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
