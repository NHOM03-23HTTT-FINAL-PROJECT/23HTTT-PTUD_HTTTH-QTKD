using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using QTKD.Application.Common.Interfaces;
using QTKD.Application.Features.Notifications;
using QTKD.Domain.Notifications;
using QTKD.Infrastructure.Persistence;
using QTKD.Infrastructure.Repositories;
using Contract = QTKD.Infrastructure.Persistence.Schema.Contract;
using Xunit;

namespace QTKD.IntegrationTests;

// NotificationRepository LINQ against SQLite: recipient scoping, filter, paging/order, contract title and read-state writes.
// SQLite has no PostgreSQL enums, so the qtkd.record_type/send_status mapping itself is NOT verified here.
// Entity → DTO mapping (kind, record type text) is covered by QTKD.UnitTests NotificationServiceTests.
public sealed class NotificationRepositorySqliteTests : IDisposable
{
    // Foreign keys off: only notification and contract rows matter here, not the users/customers they point to.
    private readonly SqliteConnection connection = new("Data Source=:memory:;Foreign Keys=False");
    private readonly QtkdDbContext db;
    private readonly Guid me = Guid.NewGuid(), other = Guid.NewGuid(), contract = Guid.NewGuid();
    private readonly DateTime start = new(2026, 11, 1, 8, 0, 0, DateTimeKind.Utc);

    public NotificationRepositorySqliteTests()
    {
        connection.Open();
        db = new QtkdDbContext(new DbContextOptionsBuilder<QtkdDbContext>().UseSqlite(connection).Options);
        db.Database.EnsureCreated();
        db.Contracts.Add(new Contract { ContractId = contract, ContractCode = "HD-000001", Title = "HĐ Demo" });
        db.SaveChanges();
    }

    public void Dispose()
    {
        db.Dispose();
        connection.Dispose();
    }

    private Notification Add(Guid recipient, string content, bool read, int minute, RecordType type = RecordType.Contract)
    {
        var n = new Notification
        {
            NotificationId = Guid.NewGuid(), RecipientId = recipient, RecordType = type,
            RecordId = type == RecordType.Contract ? contract : Guid.NewGuid(), Content = content, IsRead = read,
            CreatedAt = start.AddMinutes(minute),
        };
        db.Notifications.Add(n);
        db.SaveChanges();
        db.ChangeTracker.Clear();
        return n;
    }

    private NotificationRepository Repository() => new(db);

    [Fact]
    public async Task List_is_scoped_to_the_recipient_newest_first_with_contract_title()
    {
        var oldest = Add(me, "Thông báo cũ", read: true, minute: 1, RecordType.Customer);
        var newest = Add(me, "Mới nhất", read: false, minute: 3);
        Add(other, "Của người khác", read: false, minute: 5);

        var (items, total, unread) = await Repository().ListAsync(me, new NotificationQuery(false, 1, 20), default);

        Assert.Equal((2, 1), (total, unread));
        Assert.Equal([newest.NotificationId, oldest.NotificationId], items.Select(x => x.Entity.NotificationId).ToArray());
        Assert.Equal((RecordType.Contract, contract, "HĐ Demo", false),
            (items[0].Entity.RecordType, items[0].Entity.RecordId, items[0].RecordTitle, items[0].Entity.IsRead));
        Assert.Equal((RecordType.Customer, (string?)null), (items[1].Entity.RecordType, items[1].RecordTitle));
    }

    [Fact]
    public async Task Unread_filter_and_paging_apply_after_ordering()
    {
        Add(me, "a", read: false, minute: 1);
        Add(me, "b", read: true, minute: 2);
        Add(me, "c", read: false, minute: 3);
        Add(me, "d", read: false, minute: 4);

        var (items, total, unread) = await Repository().ListAsync(me, new NotificationQuery(true, 2, 2), default);

        Assert.Equal((3, 3), (total, unread));
        Assert.Equal(["a"], items.Select(x => x.Entity.Content).ToArray());
        Assert.Equal(3, await Repository().CountUnreadAsync(me, default));
    }

    [Fact]
    public async Task MarkRead_changes_only_the_recipients_own_notification()
    {
        var mine = Add(me, "của tôi", read: false, minute: 1);
        var theirs = Add(other, "của người khác", read: false, minute: 2);

        Assert.Null(await Repository().MarkReadAsync(me, theirs.NotificationId, default));
        Assert.Null(await Repository().MarkReadAsync(me, Guid.NewGuid(), default));
        var record = await Repository().MarkReadAsync(me, mine.NotificationId, default);

        Assert.True(record!.Entity.IsRead);
        Assert.Equal("HĐ Demo", record.RecordTitle);
        Assert.False((await db.Notifications.AsNoTracking().SingleAsync(n => n.NotificationId == theirs.NotificationId)).IsRead);
    }

    [Fact]
    public async Task MarkAllRead_counts_only_unread_rows_of_the_recipient()
    {
        Add(me, "a", read: false, minute: 1);
        Add(me, "b", read: true, minute: 2);
        Add(me, "c", read: false, minute: 3);
        Add(other, "d", read: false, minute: 4);

        Assert.Equal(2, await Repository().MarkAllReadAsync(me, default));
        Assert.Equal(0, await Repository().CountUnreadAsync(me, default));
        Assert.Equal(1, await Repository().CountUnreadAsync(other, default));
    }
}
