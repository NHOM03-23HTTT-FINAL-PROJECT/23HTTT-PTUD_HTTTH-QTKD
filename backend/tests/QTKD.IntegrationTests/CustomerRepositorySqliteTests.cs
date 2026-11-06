using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using QTKD.Infrastructure.Identity;
using QTKD.Infrastructure.Persistence;
using QTKD.Infrastructure.Persistence.Schema;
using QTKD.Infrastructure.Repositories;
using UserRole = QTKD.Domain.Identity.UserRole;
using UserStatus = QTKD.Domain.Identity.UserStatus;
using Xunit;

namespace QTKD.IntegrationTests;

// These tests exercise actual EF LINQ, not the PG enum/row-lock behavior, which is
// verified separately by CustomerReactivationPostgresTests and the business script.
public sealed class CustomerRepositorySqliteTests : IDisposable
{
    private readonly SqliteConnection connection = new("Data Source=:memory:;Foreign Keys=False");
    private readonly QtkdDbContext db;
    private readonly Guid department = Guid.NewGuid(), own = Guid.NewGuid(), peer = Guid.NewGuid(), outside = Guid.NewGuid();
    private sealed class Monitor : IOptionsMonitor<TokenOptions>
    {
        public TokenOptions CurrentValue { get; } = new();
        public TokenOptions Get(string? name) => CurrentValue;
        public IDisposable? OnChange(Action<TokenOptions, string?> listener) => null;
    }
    public CustomerRepositorySqliteTests()
    {
        connection.Open();
        db = new(new DbContextOptionsBuilder<QtkdDbContext>().UseSqlite(connection).Options);
        db.Database.EnsureCreated();
        foreach (var (id, dept) in new[] { (own, department), (peer, department), (outside, Guid.NewGuid()) })
            db.Add(new UserAccount { UserId = id, DepartmentId = dept, Username = id.ToString(), CompanyEmail = id + "@example.invalid",
                FullName = "Người thử", Role = UserRole.SalesStaff, Status = UserStatus.Active });
        db.SaveChanges(); db.ChangeTracker.Clear();
    }
    private Customer Add(int number, Guid owner, string name, ActiveStatus status = ActiveStatus.Active)
    {
        var c = new Customer { CustomerId = Guid.NewGuid(), CustomerCode = "KH-" + number.ToString("D6"), CustomerName = name,
            TaxCode = number.ToString("D10"), Address = "Địa chỉ", LegalRepresentative = "Người thử", AccountManagerId = owner, Status = status, Version = 1 };
        db.Add(c); db.SaveChanges(); db.ChangeTracker.Clear(); return c;
    }
    private CustomerRepository Repository() => new(db, new Monitor());
    public void Dispose() { db.Dispose(); connection.Dispose(); }

    [Fact]
    public async Task Scope_includes_a_peer_but_hides_other_departments_and_preserves_unknown_legacy_metadata()
    {
        var visible = Add(1, peer, "Đồng nghiệp"); var hidden = Add(2, outside, "Ngoài phòng");
        var record = await Repository().Find(department, visible.CustomerCode, false, default);
        Assert.NotNull(record); Assert.Null(record.CreatedAt); Assert.Null(record.CreatedBy); Assert.Empty(record.Services);
        Assert.Null(await Repository().Find(department, hidden.CustomerCode, false, default));
        Assert.Null(await Repository().Find(department, hidden.CustomerId, default));
    }
    [Fact]
    public async Task Folded_search_accepts_unaccented_vietnamese_and_keeps_injection_text_literal()
    {
        // SQLite LOWER is ASCII-only; PG's Unicode case folding is exercised
        // separately with "Ánh Dương" in customer-flow-postgres.mjs.
        Add(1, own, "Công ty ánh dương"); Add(2, outside, "Công ty ánh dương ngoài phòng");
        var result = await Repository().Search(department, "anh duong", "all", "name-asc", 1, 8, default);
        Assert.Equal(1, result.Total); Assert.Equal("KH-000001", Assert.Single(result.Items).Code);
        Assert.Empty((await Repository().Search(department, "' OR 1=1 --", "all", "code-asc", 1, 8, default)).Items);
    }
    [Fact]
    public async Task Filtering_and_paging_are_stable_and_do_not_drop_or_repeat_customer_rows()
    {
        for (var i = 1; i <= 10; i++) Add(i, own, "Khách " + i);
        Add(11, peer, "Tạm ngưng", ActiveStatus.Suspended); Add(12, outside, "Ngoài phòng");
        var first = await Repository().Search(department, "", "active", "code-asc", 1, 8, default);
        var second = await Repository().Search(department, "", "active", "code-asc", 2, 8, default);
        Assert.Equal((10, 10, 8, 2), (first.Total, second.Total, first.Items.Length, second.Items.Length));
        Assert.Equal(Enumerable.Range(1, 10).Select(i => "KH-" + i.ToString("D6")), first.Items.Concat(second.Items).Select(i => i.Code));
        Assert.Equal("KH-000011", Assert.Single((await Repository().Search(department, "", "suspended", "code-asc", 1, 8, default)).Items).Code);
    }
}
