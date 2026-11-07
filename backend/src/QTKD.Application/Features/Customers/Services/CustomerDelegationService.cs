using System.Text.Json;
using QTKD.Domain.Customers;
using QTKD.Domain.Identity;

namespace QTKD.Application.Features.Customers;

public sealed partial class CustomerService
{
    private static void Manager(CustomerActor actor)
    {
        if (actor.Role != UserRole.SalesManager) throw new CustomerFailure(403, "FORBIDDEN");
    }
    private async Task<bool> CanChangeStatus(CustomerActor actor, CustomerRecord row, string action, CancellationToken ct) =>
        actor.Role == UserRole.SalesManager
            ? await repository.HasPermission(actor.Role, "customers.change-status", ct)
            : actor.Role == UserRole.SalesStaff && row.OwnerId == actor.Id && await repository.HasDelegation(actor.Id, actor.DepartmentId, action, ct);
    private async Task RequireStatusPermission(CustomerActor actor, CustomerRecord row, CancellationToken ct, string action = "reactivate")
    {
        if (!await CanChangeStatus(actor, row, action, ct)) throw new CustomerFailure(403, "FORBIDDEN");
    }
    public async Task<CustomerStatusPermissions> GetStatusPermissions(Guid actorId, string code, CancellationToken ct)
    {
        var actor = await Actor(actorId, ct);
        var row = await Find(actor, code, ct);
        return new(await CanChangeStatus(actor, row, "suspend", ct), await CanChangeStatus(actor, row, "reactivate", ct));
    }
    public async Task<StatusDelegationCandidate[]> DelegationCandidates(Guid actorId, CancellationToken ct)
    {
        var actor = await Actor(actorId, ct); Manager(actor);
        return (await repository.Candidates(actor.DepartmentId, ct)).Select(c => new StatusDelegationCandidate(c.Id, c.Name, c.Username)).ToArray();
    }
    private static StatusDelegationView DelegationView(CustomerDelegation d, DateTime now) => new(d.Id, d.GranteeId, d.GranteeName, d.Username,
        d.Action, d.Reason, d.GrantedBy, d.GrantedAt, d.ExpiresAt, d.RevokedAt, d.RevokedBy,
        d.RevokedAt is not null ? "revoked" : d.ExpiresAt <= now ? "expired" : !d.Eligible ? "ineligible" : "active");
    private async Task<StatusDelegationView> Delegation(CustomerActor actor, Guid id, CancellationToken ct) =>
        DelegationView(await repository.Delegation(actor.DepartmentId, id, ct) ?? throw new CustomerFailure(404, "NOT_FOUND"), await repository.Now(ct));
    public async Task<StatusDelegationView[]> Delegations(Guid actorId, CancellationToken ct)
    {
        var actor = await Actor(actorId, ct); Manager(actor);
        var now = await repository.Now(ct);
        return (await repository.Delegations(actor.DepartmentId, ct)).Select(d => DelegationView(d, now)).ToArray();
    }
    private Task AuditDelegation(CustomerActor actor, StatusDelegationView d, string action, CancellationToken ct) =>
        repository.Audit(actor.Id, d.Id, "CustomerDelegation", action, JsonSerializer.Serialize(new
        { d.GranteeId, d.Action, actor.DepartmentId, d.ExpiresAt, d.RevokedAt, scope = "assigned_customers", d.Reason }, Json), d.Reason, ct);
    public async Task<StatusDelegationView> GrantDelegation(Guid actorId, Guid sessionId, GrantStatusDelegationRequest request, CancellationToken ct)
    {
        var reason = (request.Reason ?? "").Trim();
        if (request.GranteeId == Guid.Empty || request.Action is not ("suspend" or "reactivate") || reason.Length > 1000) throw new CustomerFailure(400, "VALIDATION");
        await using var tx = await repository.Begin(ct);
        var actor = await Authorize(actorId, sessionId, "customers.change-status", ct, exclusive: true); Manager(actor);
        if (!await repository.EligibleRecipient(request.GranteeId, actor, ct)) throw new CustomerFailure(400, "DELEGATION_RECIPIENT_INVALID");
        if (request.ExpiresAt is { } expires && expires.UtcDateTime <= await repository.Now(ct))
            throw new CustomerFailure(400, "DELEGATION_EXPIRY_INVALID");
        if (await repository.HasDelegation(request.GranteeId, actor.DepartmentId, request.Action, ct)) throw new CustomerFailure(409, "DELEGATION_EXISTS");
        var id = await repository.Grant(actor, request.GranteeId, request.Action, request.ExpiresAt?.UtcDateTime, reason.Length == 0 ? null : reason, ct);
        var result = await Delegation(actor, id, ct);
        await AuditDelegation(actor, result, "CUSTOMER_DELEGATION_GRANTED", ct);
        await tx.Commit(ct); return result;
    }
    public async Task<StatusDelegationView> RevokeDelegation(Guid actorId, Guid sessionId, Guid id, CancellationToken ct)
    {
        await using var tx = await repository.Begin(ct);
        var actor = await Authorize(actorId, sessionId, "customers.change-status", ct, exclusive: true); Manager(actor);
        var existing = await Delegation(actor, id, ct);
        if (existing.RevokedAt is not null) { await tx.Commit(ct); return existing; }
        await repository.Revoke(actor.DepartmentId, id, actor.Id, ct);
        var result = await Delegation(actor, id, ct);
        await AuditDelegation(actor, result, "CUSTOMER_DELEGATION_REVOKED", ct);
        await tx.Commit(ct); return result;
    }
}
