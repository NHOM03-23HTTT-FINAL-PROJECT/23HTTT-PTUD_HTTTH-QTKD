using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using QTKD.Application.Common.Interfaces;
using QTKD.Application.Features.Audit;
using QTKD.Infrastructure.Persistence;
using QTKD.Infrastructure.Persistence.Schema;
using QTKD.Infrastructure.Repositories;
using Xunit;

namespace QTKD.IntegrationTests;

// AuditLogRepository LINQ against SQLite: filters, paging/order, actor name and append.
// The PostgreSQL append-only trigger is NOT exercised here.
public sealed class AuditLogRepositorySqliteTests : IDisposable
{
    // Foreign keys off: users are only needed for the actor name.
    private readonly SqliteConnection connection = new("Data Source=:memory:;Foreign Keys=False");
    private readonly QtkdDbContext db;
    private readonly Guid alice = Guid.NewGuid(), bob = Guid.NewGuid(), contract = Guid.NewGuid();
    private readonly DateTime start = new(2026, 11, 1, 8, 0, 0, DateTimeKind.Utc);

    public AuditLogRepositorySqliteTests()
    {
        connection.Open();
        db = new QtkdDbContext(new DbContextOptionsBuilder<QtkdDbContext>().UseSqlite(connection).Options);
        db.Database.EnsureCreated();
        db.AddRange(
            new UserAccount { UserId = alice, Username = "alice", CompanyEmail = "a@example.invalid", FullName = "Alice" },
            new UserAccount { UserId = bob, Username = "bob", CompanyEmail = "b@example.invalid", FullName = "Bob" });
        db.SaveChanges();
    }

    public void Dispose()
    {
        db.Dispose();
        connection.Dispose();
    }

    private AuditLog Add(Guid actor, string action, int minute, string type = "Contract", Guid? entity = null)
    {
        var log = new AuditLog
        {
            LogId = Guid.NewGuid(), ActorId = actor, Action = action, EntityType = type, EntityId = entity ?? contract,
            ActedAt = start.AddMinutes(minute), ValueAfter = """{"title":"A"}""",
        };
        db.Add(log);
        db.SaveChanges();
        db.ChangeTracker.Clear();
        return log;
    }

    private static AuditQuery Query(DateTime? from = null, DateTime? to = null, Guid? actor = null, string? type = null,
        Guid? entity = null, string? action = null, int page = 1, int size = 20) => new(from, to, actor, type, entity, action, page, size);

    [Fact]
    public async Task Search_filters_newest_first_with_actor_name_and_pages()
    {
        var old = Add(alice, "CONTRACT_CREATED", 1);
        var mid = Add(bob, "CONTRACT_SUBMITTED", 2);
        var latest = Add(alice, "CONTRACT_SUBMITTED", 3);
        Add(alice, "LOGIN", 4, type: "UserAccount", entity: alice);

        var repository = new AuditLogRepository(db);
        var (items, total) = await repository.SearchAsync(Query(type: "Contract"), default);
        Assert.Equal(3, total);
        Assert.Equal([latest.LogId, mid.LogId, old.LogId], items.Select(i => i.Id));
        Assert.Equal(("Alice", """{"title":"A"}"""), (items[0].ActorName, items[0].ValueAfter));

        var (byActor, _) = await repository.SearchAsync(Query(actor: bob), default);
        Assert.Equal([mid.LogId], byActor.Select(i => i.Id));

        var (window, windowTotal) = await repository.SearchAsync(Query(from: start.AddMinutes(2), to: start.AddMinutes(3), action: "CONTRACT_SUBMITTED"), default);
        Assert.Equal(2, windowTotal);

        var (second, pagedTotal) = await repository.SearchAsync(Query(entity: contract, page: 2, size: 2), default);
        Assert.Equal(3, pagedTotal);
        Assert.Equal([old.LogId], second.Select(i => i.Id));
        Assert.Equal(2, window.Count);
    }

    [Fact]
    public async Task Entity_code_resolves_for_contracts_and_areas_and_is_null_once_the_entity_is_gone()
    {
        var area = Guid.NewGuid();
        db.Set<QTKD.Infrastructure.Persistence.Schema.Contract>().Add(new() { ContractId = contract, ContractCode = "HD-000001", Title = "HĐ" });
        db.Set<QTKD.Domain.Entities.Area>().Add(new() { AreaId = area, AreaCode = "KV-01", AreaName = "Khu A", AreaType = "Area", HierarchyPath = "/KV-01" });
        db.SaveChanges();
        db.ChangeTracker.Clear();
        var contractLog = Add(alice, "CONTRACT_SUBMITTED", 1, "Contract", contract);
        var areaLog = Add(alice, "CREATE", 2, "Area", area);
        var goneLog = Add(alice, "CONTRACT_SUBMITTED", 3, "Contract", Guid.NewGuid());

        var repository = new AuditLogRepository(db);
        Assert.Equal("HD-000001", (await repository.FindAsync(contractLog.LogId, default))!.EntityCode);
        Assert.Equal("KV-01", (await repository.FindAsync(areaLog.LogId, default))!.EntityCode);
        Assert.Null((await repository.FindAsync(goneLog.LogId, default))!.EntityCode);
    }

    [Fact]
    public async Task Find_options_and_append()
    {
        var log = Add(bob, "CONTRACT_SUBMITTED", 1);
        var repository = new AuditLogRepository(db);

        Assert.Equal("Bob", (await repository.FindAsync(log.LogId, default))!.ActorName);
        Assert.Null(await repository.FindAsync(Guid.NewGuid(), default));

        await repository.AppendAsync(new(alice, AuditActions.Search, AuditActions.EntityType, null, new { Page = 1 }, "127.0.0.1"), default);
        var appended = await db.Set<AuditLog>().AsNoTracking().SingleAsync(l => l.Action == AuditActions.Search);
        Assert.Equal((alice, """{"page":1}""", "127.0.0.1"), (appended.ActorId!.Value, appended.ValueAfter, appended.IpAddress));

        var options = await repository.OptionsAsync(default);
        // String order follows the database collation, so only the distinct values are compared.
        Assert.Equal(["AuditLog", "Contract"], options.EntityTypes.Order(StringComparer.Ordinal));
        Assert.Equal([AuditActions.Search, "CONTRACT_SUBMITTED"], options.Actions.Order(StringComparer.Ordinal));
        Assert.Equal(["Alice", "Bob"], options.Actors.Select(a => a.Name));
    }
}

