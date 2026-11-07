using System.Data.Common;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using QTKD.Api.BackgroundServices;
using QTKD.Application.Common.Interfaces;
using QTKD.Application.Features.Notifications;
using QTKD.Domain.Notifications;
using QTKD.Infrastructure.Persistence;
using QTKD.Infrastructure.Repositories;
using Xunit;

namespace QTKD.IntegrationTests;

public sealed class NotificationDeliveryTests : IDisposable
{
    private readonly SqliteConnection connection = new("Data Source=:memory:;Foreign Keys=False");
    private readonly PublicationFailure failure = new();
    private readonly QtkdDbContext db;
    private readonly Guid recipient = Guid.NewGuid();

    public NotificationDeliveryTests()
    {
        connection.Open();
        db = new(new DbContextOptionsBuilder<QtkdDbContext>().UseSqlite(connection).AddInterceptors(failure).Options);
        db.Database.EnsureCreated();
    }
    public void Dispose() { db.Dispose(); connection.Dispose(); }
    private Notification Add(SendStatus status, Guid? contract = null, bool read = false, int minute = 0)
    {
        var n = new Notification { NotificationId = Guid.NewGuid(), RecipientId = recipient, RecordType = RecordType.Contract,
            RecordId = contract ?? Guid.NewGuid(), Content = "TEST ONLY", IsRead = read, SendStatus = status,
            CreatedAt = new DateTime(2026, 11, 7, 0, 0, 0, DateTimeKind.Utc).AddMinutes(minute) };
        db.Notifications.Add(n); db.SaveChanges(); db.ChangeTracker.Clear(); return n;
    }
    private Task<int> Publish(int batch = 100, Guid? contract = null) =>
        new NotificationDeliveryRepository(db).PublishPendingAsync(batch, contract, default);

    [Fact]
    public async Task Pending_and_failed_messages_are_hidden_until_published_then_appear_once_in_the_recipients_inbox()
    {
        var pending = Add(SendStatus.Pending);
        var failed = Add(SendStatus.Failed, read: true);
        var inbox = new NotificationRepository(db);
        Assert.Empty((await inbox.ListAsync(recipient, new NotificationQuery(false, 1, 20), default)).Items);
        Assert.Equal(0, await inbox.CountUnreadAsync(recipient, default));
        Assert.Null(await inbox.MarkReadAsync(recipient, pending.NotificationId, default));
        Assert.Equal(0, await inbox.MarkAllReadAsync(recipient, default));
        Assert.Equal(2, await Publish());
        Assert.Equal(0, await Publish());
        var (items, total, unread) = await inbox.ListAsync(recipient, new NotificationQuery(false, 1, 20), default);
        Assert.Equal((2, 1), (total, unread));
        Assert.Equal(new[] { pending.NotificationId, failed.NotificationId }.Order(), items.Select(n => n.Entity.NotificationId).Order());
        Assert.All(items, n => Assert.Equal(SendStatus.Sent, n.Entity.SendStatus));
        Assert.Empty((await inbox.ListAsync(Guid.NewGuid(), new NotificationQuery(false, 1, 20), default)).Items);
    }

    [Fact]
    public async Task Batches_publish_oldest_first_and_manual_retry_only_affects_the_requested_contract()
    {
        var contract = Guid.NewGuid();
        var oldest = Add(SendStatus.Pending, contract, minute: 0);
        var newer = Add(SendStatus.Failed, contract, minute: 1);
        var unrelated = Add(SendStatus.Pending, minute: -1);
        Assert.Equal(1, await Publish(1, contract));
        Assert.Equal(SendStatus.Sent, (await db.Notifications.SingleAsync(n => n.NotificationId == oldest.NotificationId)).SendStatus);
        Assert.Equal(SendStatus.Failed, (await db.Notifications.SingleAsync(n => n.NotificationId == newer.NotificationId)).SendStatus);
        db.ChangeTracker.Clear();
        Assert.Equal(1, await Publish(1, contract));
        Assert.Equal(0, await Publish(1, contract));
        Assert.Equal(SendStatus.Pending, (await db.Notifications.SingleAsync(n => n.NotificationId == unrelated.NotificationId)).SendStatus);
        Assert.Equal(3, await db.Notifications.CountAsync());
    }

    [Fact]
    public async Task Database_failure_keeps_the_same_durable_rows_for_retry_without_resetting_read_state()
    {
        var message = Add(SendStatus.Pending, read: true);
        failure.Enabled = true;
        await Assert.ThrowsAsync<IOException>(() => Publish());
        Assert.Equal(SendStatus.Pending, (await db.Notifications.AsNoTracking().SingleAsync()).SendStatus);
        failure.Enabled = false;
        Assert.Equal(1, await Publish());
        var delivered = await db.Notifications.AsNoTracking().SingleAsync();
        Assert.Equal((message.NotificationId, true, SendStatus.Sent), (delivered.NotificationId, delivered.IsRead, delivered.SendStatus));
    }

    [Fact]
    public async Task Rolled_back_publication_is_retried_successfully()
    {
        Add(SendStatus.Pending);
        await using (var tx = await db.Database.BeginTransactionAsync())
        { Assert.Equal(1, await Publish()); await tx.RollbackAsync(); }
        Assert.Equal(SendStatus.Pending, (await db.Notifications.AsNoTracking().SingleAsync()).SendStatus);
        Assert.Equal(1, await Publish());
        Assert.Equal(0, await Publish());
    }

    [Fact]
    public async Task Worker_recovers_from_failure_without_an_http_request_or_manual_retry()
    {
        var delivery = new RecoveringDelivery();
        await using var services = new ServiceCollection().AddScoped<INotificationDeliveryRepository>(_ => delivery).BuildServiceProvider();
        using var worker = new NotificationDeliveryWorker(services.GetRequiredService<IServiceScopeFactory>(),
            Options.Create(new NotificationDeliveryOptions { PollSeconds = 1 }), TimeProvider.System,
            NullLogger<NotificationDeliveryWorker>.Instance);
        await worker.StartAsync(default);
        try { await delivery.Published.Task.WaitAsync(TimeSpan.FromSeconds(10)); }
        finally { await worker.StopAsync(default); }
        Assert.Equal(2, delivery.Attempts);
    }

    private sealed class PublicationFailure : DbCommandInterceptor
    {
        public bool Enabled;
        public override ValueTask<InterceptionResult<int>> NonQueryExecutingAsync(DbCommand command, CommandEventData eventData,
            InterceptionResult<int> result, CancellationToken cancellationToken = default)
        {
            if (Enabled && command.CommandText.StartsWith("UPDATE", StringComparison.OrdinalIgnoreCase)) throw new IOException("Simulated publication failure");
            return base.NonQueryExecutingAsync(command, eventData, result, cancellationToken);
        }
    }
    private sealed class RecoveringDelivery : INotificationDeliveryRepository
    {
        public int Attempts;
        public TaskCompletionSource Published = new(TaskCreationOptions.RunContinuationsAsynchronously);
        public Task<int> PublishPendingAsync(int batchSize, Guid? contractId, CancellationToken ct)
        {
            if (Interlocked.Increment(ref Attempts) == 1) throw new IOException("Simulated unavailable database");
            Published.TrySetResult(); return Task.FromResult(1);
        }
    }
}
