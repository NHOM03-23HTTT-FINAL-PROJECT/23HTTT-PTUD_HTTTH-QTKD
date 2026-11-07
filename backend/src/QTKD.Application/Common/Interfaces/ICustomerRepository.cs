using QTKD.Domain.Customers;
using QTKD.Domain.Identity;

namespace QTKD.Application.Common.Interfaces;

public interface ICustomerTransaction : IAsyncDisposable
{
    Task Commit(CancellationToken ct);
}

public interface ICustomerRepository
{
    Task<ICustomerTransaction> Begin(CancellationToken ct, bool repeatableRead = false);
    Task<DateTime> Now(CancellationToken ct);
    Task<CustomerActor?> Actor(Guid id, CancellationToken ct);
    Task<CustomerActor?> AuthorizeMutation(Guid id, Guid session, string permission, bool exclusive, CancellationToken ct);
    Task<bool> SessionValid(Guid id, Guid session, CancellationToken ct);
    Task<bool> HasPermission(UserRole role, string permission, CancellationToken ct);
    Task LockRequest(Guid actor, string operation, string key, CancellationToken ct);
    Task<CustomerReceipt?> Receipt(Guid actor, string operation, string key, CancellationToken ct);
    Task SaveReceipt(Guid actor, string operation, string key, string hash, Guid customer, string response, CancellationToken ct);
    Task<CustomerRecord?> Find(Guid department, string code, bool forUpdate, CancellationToken ct);
    Task<CustomerRecord?> Find(Guid department, Guid id, CancellationToken ct);
    Task<(CustomerRecord[] Items, int Total)> Search(Guid department, string term, string status, string sort, int page, int size, CancellationToken ct);
    Task<string[]> History(Guid customer, CancellationToken ct);
    Task<CustomerDecision[]> Decisions(Guid customer, CancellationToken ct);
    Task<CustomerInsert> Insert(CustomerActor actor, CustomerValues values, CancellationToken ct);
    Task Update(Guid customer, CustomerValues values, CancellationToken ct);
    Task SetStatus(Guid customer, string status, CancellationToken ct);
    Task<Guid> AddDecision(Guid customer, Guid actor, string action, string reason, string? basis, string? plan, string metadata, CancellationToken ct);
    Task<CustomerSuspensionSnapshot> SuspensionSnapshot(Guid customer, Guid actor, bool forConfirmation, CancellationToken ct);
    Task AddOutbox(Guid decision, string payload, CancellationToken ct);
    Task Audit(Guid actor, Guid entity, string entityType, string action, string value, string? note, CancellationToken ct);
    Task<bool> HasDelegation(Guid actor, Guid department, string action, CancellationToken ct);
    Task<CustomerDelegatePerson[]> Candidates(Guid department, CancellationToken ct);
    Task<bool> EligibleRecipient(Guid id, CustomerActor grantor, CancellationToken ct);
    Task<CustomerDelegation[]> Delegations(Guid department, CancellationToken ct);
    Task<CustomerDelegation?> Delegation(Guid department, Guid id, CancellationToken ct);
    Task<Guid> Grant(CustomerActor actor, Guid grantee, string action, DateTime? expires, string? reason, CancellationToken ct);
    Task Revoke(Guid department, Guid id, Guid actor, CancellationToken ct);
}
