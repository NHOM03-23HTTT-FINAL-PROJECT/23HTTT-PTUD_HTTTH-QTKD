using QTKD.Application.Features.Customers;

namespace QTKD.Application.Common.Interfaces;

// An implementation may use the request's scoped repository/context, but callers
// cannot supply connections, transactions or claims of authoritative approval.
public interface ICustomerStatusSource
{
    Task<ReactivationSourceResult> Reactivation(Guid customerId, Guid actorId, string? reasonGroup,
        StatusException? exception, CancellationToken ct);
}

public sealed record ReactivationSourceResult(bool Complete, bool Allowed, string[] MissingSources,
    ReactivationCheck[] Checks, string? VerifiedBasis);
