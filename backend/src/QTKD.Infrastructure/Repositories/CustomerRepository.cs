using System.Data;
using System.Linq.Expressions;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;
using Microsoft.Extensions.Options;
using Npgsql;
using QTKD.Application.Common.Interfaces;
using QTKD.Domain.Customers;
using QTKD.Infrastructure.Identity;
using QTKD.Infrastructure.Persistence;
using QTKD.Infrastructure.Persistence.Schema;
using DbUser = QTKD.Infrastructure.Persistence.Schema.UserAccount;
using UserRole = QTKD.Domain.Identity.UserRole;
using UserStatus = QTKD.Domain.Identity.UserStatus;

namespace QTKD.Infrastructure.Repositories;

/// <summary>
/// Customer persistence through the request-scoped QtkdDbContext. SQL is limited
/// to PostgreSQL locks and the database clock; CRUD, scope and paging use EF LINQ.
/// </summary>
public sealed class CustomerRepository(QtkdDbContext db, IOptionsMonitor<TokenOptions> tokens) : ICustomerRepository
{
    private IQueryable<DbUser> Users => db.Set<DbUser>().AsNoTracking();
    private IQueryable<Customer> Customers => db.Set<Customer>().AsNoTracking();
    private IQueryable<Customer> Scoped(Guid department) =>
        Customers.Where(c => Users.Any(u => u.UserId == c.AccountManagerId && u.DepartmentId == department));
    private sealed class Transaction(QtkdDbContext context, IDbContextTransaction transaction) : ICustomerTransaction
    {
        public Task Commit(CancellationToken ct) => transaction.CommitAsync(ct);
        public async ValueTask DisposeAsync()
        {
            await transaction.DisposeAsync();
            context.ChangeTracker.Clear();
        }
    }
    public async Task<ICustomerTransaction> Begin(CancellationToken ct, bool repeatableRead = false) =>
        new Transaction(db, await db.Database.BeginTransactionAsync(repeatableRead ? IsolationLevel.RepeatableRead : IsolationLevel.ReadCommitted, ct));
    public Task<DateTime> Now(CancellationToken ct) => db.Database.IsNpgsql()
        ? db.Database.SqlQuery<DateTime>($"SELECT clock_timestamp() AS \"Value\"").SingleAsync(ct)
        : Task.FromResult(DateTime.UtcNow);
    public Task<CustomerActor?> Actor(Guid id, CancellationToken ct) =>
        (from u in Users join d in db.Set<Department>() on u.DepartmentId equals d.DepartmentId
         where u.UserId == id && u.Status == UserStatus.Active && d.Code == "KD"
         select new CustomerActor(u.UserId, u.DepartmentId, u.Role, u.FullName)).SingleOrDefaultAsync(ct);
    public Task<bool> HasPermission(UserRole role, string permission, CancellationToken ct) =>
        db.Set<RolePermission>().AnyAsync(p => p.Role == role && p.PermissionCode == permission, ct);
    public async Task<CustomerActor?> AuthorizeMutation(Guid id, Guid session, string permission, bool exclusive, CancellationToken ct)
    {
        // Same lock and user-lock order as Identity administration/logout.
        if (db.Database.IsNpgsql())
        {
            if (exclusive) await db.Database.ExecuteSqlRawAsync("SELECT pg_advisory_xact_lock(22023)", ct);
            else await db.Database.ExecuteSqlRawAsync("SELECT pg_advisory_xact_lock_shared(22023)", ct);
            await db.Set<DbUser>().FromSqlInterpolated($"SELECT * FROM qtkd.user_account WHERE user_id={id} FOR UPDATE")
                .AsNoTracking().ToListAsync(ct);
        }
        var now = await Now(ct);
        return await (from u in Users join d in db.Set<Department>() on u.DepartmentId equals d.DepartmentId
                      where u.UserId == id && u.Status == UserStatus.Active && !u.MustChangePassword && d.Code == "KD"
                        && (u.LockedUntil == null || u.LockedUntil <= now)
                        && db.Set<RolePermission>().Any(p => p.Role == u.Role && p.PermissionCode == permission)
                        && db.Set<RolePermission>().Any(p => p.Role == u.Role && p.PermissionCode == "customers.view")
                      select new CustomerActor(u.UserId, u.DepartmentId, u.Role, u.FullName)).SingleOrDefaultAsync(ct);
    }
    public async Task<bool> SessionValid(Guid id, Guid session, CancellationToken ct)
    {
        var now = await Now(ct); var idle = tokens.CurrentValue.IdleMinutes;
        return await db.Set<LoginSession>().AnyAsync(s => s.SessionId == session && s.UserId == id && !s.IsRevoked
            && s.ExpiresAt > now && s.LastActivityAt.AddMinutes(idle) > now, ct);
    }
    public Task LockRequest(Guid actor, string operation, string key, CancellationToken ct) => db.Database.IsNpgsql()
        ? db.Database.ExecuteSqlInterpolatedAsync($"SELECT pg_advisory_xact_lock(hashtextextended({$"customer:{actor}:{operation}:{key}"}, 0))", ct)
        : Task.CompletedTask;
    public async Task<CustomerReceipt?> Receipt(Guid actor, string operation, string key, CancellationToken ct) =>
        await db.Set<CustomerOperation>().AsNoTracking().Where(r => r.ActorId == actor && r.Operation == operation && r.RequestKey == key)
            .Select(r => new CustomerReceipt(r.CustomerId, r.RequestHash, r.Response)).SingleOrDefaultAsync(ct);
    public async Task SaveReceipt(Guid actor, string operation, string key, string hash, Guid customer, string response, CancellationToken ct)
    {
        db.Add(new CustomerOperation { ActorId = actor, Operation = operation, RequestKey = key, RequestHash = hash,
            CustomerId = customer, Response = response, CreatedAt = await Now(ct) });
        await db.SaveChangesAsync(ct);
    }
    private IQueryable<CustomerRecord> Records(IQueryable<Customer> source) =>
        from c in source
        join owner in Users on c.AccountManagerId equals owner.UserId
        join profile in db.Set<CustomerProfileData>().AsNoTracking() on c.CustomerId equals profile.CustomerId into profiles
        from p in profiles.DefaultIfEmpty()
        join creator in Users on p.CreatedBy equals (Guid?)creator.UserId into creators
        from creator in creators.DefaultIfEmpty()
        select new CustomerRecord(c.CustomerId, c.CustomerName, c.TaxCode, c.Address, c.LegalRepresentative,
            c.ContactName ?? "", c.ContactTitle ?? "", c.Phone ?? "", c.Email ?? "", c.CustomerGroup ?? "",
            p == null ? new string[0] : p.ServiceGroups ?? new string[0], c.Status == ActiveStatus.Active ? "Active" : "Suspended",
            c.AccountManagerId, owner.FullName, c.Version, p == null ? null : p.CreatedAt,
            creator == null ? null : creator.FullName, c.CustomerUpdatedAt, c.CustomerCode, c.InterestedServices);
    public async Task<CustomerRecord?> Find(Guid department, string code, bool forUpdate, CancellationToken ct)
    {
        if (forUpdate && db.Database.IsNpgsql())
            await db.Set<Customer>().FromSqlInterpolated($"""
                SELECT c.* FROM qtkd.customer c JOIN qtkd.user_account owner ON owner.user_id=c.account_manager_id
                WHERE c.customer_code={code} AND owner.department_id={department} FOR UPDATE OF c
                """).AsNoTracking().ToListAsync(ct);
        return await Records(Scoped(department).Where(c => c.CustomerCode == code)).SingleOrDefaultAsync(ct);
    }
    public Task<CustomerRecord?> Find(Guid department, Guid id, CancellationToken ct) =>
        Records(Scoped(department).Where(c => c.CustomerId == id)).SingleOrDefaultAsync(ct);

    // Built as LINQ string.Replace calls so PostgreSQL can filter/sort folded text
    // without a new DB extension, function, client-side scan or schema migration.
    private static Expression Folded(Expression value)
    {
        const string accents = "àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ";
        var plain = new string('a', 17) + new string('e', 11) + new string('i', 5) + new string('o', 17) + new string('u', 11) + new string('y', 5) + "d";
        value = Expression.Call(value, nameof(string.ToLower), Type.EmptyTypes);
        for (var i = 0; i < accents.Length; i++)
            value = Expression.Call(value, nameof(string.Replace), Type.EmptyTypes, Expression.Constant(accents[i].ToString()), Expression.Constant(plain[i].ToString()));
        return value;
    }
    public async Task<(CustomerRecord[] Items, int Total)> Search(Guid department, string term, string status, string sort, int page, int size, CancellationToken ct)
    {
        var query = Scoped(department);
        if (status != "all") query = query.Where(c => c.Status == (status == "active" ? ActiveStatus.Active : ActiveStatus.Suspended));
        var parameter = Expression.Parameter(typeof(Customer), "c");
        if (term.Length > 0)
        {
            Expression Contains(Expression value) => Expression.Call(value, nameof(string.Contains), Type.EmptyTypes, Expression.Constant(term));
            var predicate = Expression.OrElse(Contains(Folded(Expression.Property(parameter, nameof(Customer.CustomerName)))),
                Expression.OrElse(Contains(Folded(Expression.Property(parameter, nameof(Customer.Address)))),
                    Expression.OrElse(Contains(Expression.Property(parameter, nameof(Customer.TaxCode))),
                        Contains(Expression.Call(Expression.Property(parameter, nameof(Customer.CustomerCode)), nameof(string.ToLower), Type.EmptyTypes)))));
            query = query.Where(Expression.Lambda<Func<Customer, bool>>(predicate, parameter));
        }
        var total = await query.CountAsync(ct);
        var ordered = sort switch
        {
            "code-asc" => query.OrderBy(c => c.CustomerCode),
            "name-asc" => query.OrderBy(Expression.Lambda<Func<Customer, string>>(Folded(Expression.Property(parameter, nameof(Customer.CustomerName))), parameter)).ThenBy(c => c.CustomerCode),
            _ => query.OrderBy(c => c.CustomerUpdatedAt == null).ThenByDescending(c => c.CustomerUpdatedAt).ThenBy(c => c.CustomerCode)
        };
        var ids = await ordered.Skip((page - 1) * size).Take(size).Select(c => c.CustomerId).ToArrayAsync(ct);
        var records = await Records(Scoped(department).Where(c => ids.Contains(c.CustomerId))).ToDictionaryAsync(c => c.Id, ct);
        return (ids.Select(id => records[id]).ToArray(), total);
    }
    public async Task<string[]> History(Guid customer, CancellationToken ct) =>
        await db.Set<AuditLog>().AsNoTracking().Where(a => a.EntityType == "Customer" && a.EntityId == customer
            && (a.Action == "CUSTOMER_CREATED" || a.Action == "CUSTOMER_UPDATED") && a.ValueAfter != null)
            .OrderBy(a => a.ActedAt).ThenBy(a => a.LogId).Select(a => a.ValueAfter!).ToArrayAsync(ct);
    public Task<CustomerDecision[]> Decisions(Guid customer, CancellationToken ct) =>
        (from d in db.Set<CustomerStatusDecision>().AsNoTracking() join u in Users on d.ConfirmedBy equals u.UserId
         where d.CustomerId == customer orderby d.DecidedAt, d.DecisionId
         select new CustomerDecision(d.DecisionType == CustomerDecisionType.Suspend ? "Suspend" : "Reactivate",
             d.Reason, d.Basis, d.FollowUpPlan, u.FullName, d.DecidedAt, d.ReviewMetadata)).ToArrayAsync(ct);
    private static void Assign(Customer entity, CustomerValues v)
    {
        entity.CustomerName = v.Name; entity.Address = v.Address; entity.LegalRepresentative = v.Representative;
        entity.ContactName = v.ContactName; entity.ContactTitle = v.ContactTitle; entity.Phone = v.Phone; entity.Email = v.Email; entity.CustomerGroup = v.Group;
    }
    public async Task<CustomerInsert> Insert(CustomerActor actor, CustomerValues values, CancellationToken ct)
    {
        var transaction = db.Database.CurrentTransaction ?? throw new InvalidOperationException("A customer write requires a transaction.");
        await transaction.CreateSavepointAsync("customer_insert", ct);
        var now = await Now(ct);
        var entity = new Customer { CustomerCode = null!, TaxCode = values.TaxCode, AccountManagerId = actor.Id, CustomerUpdatedAt = now };
        Assign(entity, values); db.Add(entity);
        try { await db.SaveChangesAsync(ct); }
        catch (DbUpdateException e) when (e.InnerException is PostgresException { SqlState: PostgresErrorCodes.UniqueViolation, ConstraintName: "customer_tax_code_key" })
        {
            await transaction.RollbackToSavepointAsync("customer_insert", ct);
            db.ChangeTracker.Clear();
            return new(null, await Records(Scoped(actor.DepartmentId).Where(c => c.TaxCode == values.TaxCode)).SingleOrDefaultAsync(ct));
        }
        db.Add(new CustomerProfileData { CustomerId = entity.CustomerId, ServiceGroups = values.Services,
            CreatedAt = now, CreatedBy = actor.Id, UpdatedAt = now });
        await db.SaveChangesAsync(ct);
        return new(entity.CustomerId, null);
    }
    public async Task Update(Guid customer, CustomerValues values, CancellationToken ct)
    {
        var entity = await db.Set<Customer>().SingleAsync(c => c.CustomerId == customer, ct);
        Assign(entity, values); entity.CustomerUpdatedAt = await Now(ct); entity.FlowRevision++;
        var profile = await db.Set<CustomerProfileData>().SingleOrDefaultAsync(p => p.CustomerId == customer, ct);
        if (profile is null) { profile = new CustomerProfileData { CustomerId = customer }; db.Add(profile); }
        profile.ServiceGroups = values.Services; profile.UpdatedAt = entity.CustomerUpdatedAt;
        await db.SaveChangesAsync(ct);
        // The existing DB trigger owns version increments. Refresh before building history/response.
        await db.Entry(entity).ReloadAsync(ct);
    }
    public async Task SetActive(Guid customer, CancellationToken ct)
    {
        var entity = await db.Set<Customer>().SingleAsync(c => c.CustomerId == customer, ct);
        entity.Status = ActiveStatus.Active; entity.CustomerUpdatedAt = await Now(ct); entity.FlowRevision++;
        await db.SaveChangesAsync(ct); await db.Entry(entity).ReloadAsync(ct);
    }
    public async Task<Guid> AddDecision(Guid customer, Guid actor, string reason, string? basis, string metadata, CancellationToken ct)
    {
        var entity = new CustomerStatusDecision { CustomerId = customer, DecisionType = CustomerDecisionType.Reactivate,
            Reason = reason, Basis = basis, ConfirmedBy = actor, DecidedAt = await Now(ct), ReviewMetadata = metadata };
        db.Add(entity); await db.SaveChangesAsync(ct); return entity.DecisionId;
    }
    public async Task AddOutbox(Guid decision, string payload, CancellationToken ct)
    {
        db.Add(new CustomerStatusOutbox { DecisionId = decision, Payload = payload, CreatedAt = await Now(ct) });
        await db.SaveChangesAsync(ct);
    }
    public async Task Audit(Guid actor, Guid entity, string entityType, string action, string value, string? note, CancellationToken ct)
    {
        db.Add(new AuditLog { EntityType = entityType, EntityId = entity, Action = action, ActorId = actor,
            ActedAt = await Now(ct), ValueAfter = value, Note = note });
        await db.SaveChangesAsync(ct);
    }
    public async Task<bool> HasDelegation(Guid actor, Guid department, CancellationToken ct)
    {
        var now = await Now(ct);
        return await db.Set<CustomerStatusDelegation>().AnyAsync(d => d.GranteeId == actor && d.DepartmentId == department
            && d.Action == CustomerDecisionType.Reactivate && d.RevokedAt == null && (d.ExpiresAt == null || d.ExpiresAt > now), ct);
    }
    public Task<CustomerDelegatePerson[]> Candidates(Guid department, CancellationToken ct) =>
        Users.Where(u => u.DepartmentId == department && u.Role == UserRole.SalesStaff && u.Status == UserStatus.Active)
            .OrderBy(u => u.FullName).ThenBy(u => u.Username).Select(u => new CustomerDelegatePerson(u.UserId, u.FullName, u.Username)).ToArrayAsync(ct);
    public Task<bool> EligibleRecipient(Guid id, CustomerActor grantor, CancellationToken ct) =>
        Users.AnyAsync(u => u.UserId == id && u.UserId != grantor.Id && u.DepartmentId == grantor.DepartmentId
            && u.Role == UserRole.SalesStaff && u.Status == UserStatus.Active, ct);
    private IQueryable<CustomerDelegation> DelegationRows(Guid department, Guid? id = null) =>
        from d in db.Set<CustomerStatusDelegation>().AsNoTracking()
        join grantee in Users on d.GranteeId equals grantee.UserId
        join grantor in Users on d.GrantedBy equals grantor.UserId
        join revoker in Users on d.RevokedBy equals (Guid?)revoker.UserId into revokers
        from revoker in revokers.DefaultIfEmpty()
        where d.DepartmentId == department && d.Action == CustomerDecisionType.Reactivate && (id == null || d.DelegationId == id)
        orderby d.GrantedAt descending, d.DelegationId
        select new CustomerDelegation(d.DelegationId, d.GranteeId, grantee.FullName, grantee.Username, d.Reason,
            grantor.FullName, d.GrantedAt, d.ExpiresAt, d.RevokedAt, revoker == null ? null : revoker.FullName,
            grantee.Status == UserStatus.Active && grantee.Role == UserRole.SalesStaff && grantee.DepartmentId == d.DepartmentId);
    public Task<CustomerDelegation[]> Delegations(Guid department, CancellationToken ct) => DelegationRows(department).ToArrayAsync(ct);
    public Task<CustomerDelegation?> Delegation(Guid department, Guid id, CancellationToken ct) =>
        DelegationRows(department, id).SingleOrDefaultAsync(ct);
    public async Task<Guid> Grant(CustomerActor actor, Guid grantee, DateTime? expires, string? reason, CancellationToken ct)
    {
        var d = new CustomerStatusDelegation { GranteeId = grantee, GrantedBy = actor.Id, DepartmentId = actor.DepartmentId,
            Action = CustomerDecisionType.Reactivate, Reason = reason, GrantedAt = await Now(ct), ExpiresAt = expires };
        db.Add(d); await db.SaveChangesAsync(ct); return d.DelegationId;
    }
    public async Task Revoke(Guid department, Guid id, Guid actor, CancellationToken ct)
    {
        var d = await db.Set<CustomerStatusDelegation>().SingleAsync(d => d.DepartmentId == department && d.DelegationId == id, ct);
        d.RevokedAt = await Now(ct); d.RevokedBy = actor; await db.SaveChangesAsync(ct);
    }
}
