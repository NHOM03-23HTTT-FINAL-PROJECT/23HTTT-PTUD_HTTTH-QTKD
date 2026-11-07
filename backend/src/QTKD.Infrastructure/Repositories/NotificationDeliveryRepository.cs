using Microsoft.EntityFrameworkCore;
using QTKD.Application.Common.Interfaces;
using QTKD.Domain.Notifications;
using QTKD.Infrastructure.Persistence;

namespace QTKD.Infrastructure.Repositories;

public sealed class NotificationDeliveryRepository(QtkdDbContext db) : INotificationDeliveryRepository
{
    public Task<int> PublishPendingAsync(int batchSize, Guid? contractId, CancellationToken ct)
    {
        ArgumentOutOfRangeException.ThrowIfLessThan(batchSize, 1);
        ArgumentOutOfRangeException.ThrowIfGreaterThan(batchSize, 1000);
        var pending = db.Notifications.Where(n => n.SendStatus == SendStatus.Pending || n.SendStatus == SendStatus.Failed);
        if (contractId.HasValue)
            pending = pending.Where(n => n.RecordType == RecordType.Contract && n.RecordId == contractId.Value);
        var ids = pending.OrderBy(n => n.CreatedAt).ThenBy(n => n.NotificationId)
            .Take(batchSize).Select(n => n.NotificationId);
        // Publication is the status change on the SAME durable inbox row. No copy, network send or second insert:
        // concurrent workers/manual retries cannot create duplicate messages or replay approval actions.
        // A failed statement leaves the rows queued for the next attempt, even across API restarts.
        return pending.Where(n => ids.Contains(n.NotificationId))
            .ExecuteUpdateAsync(s => s.SetProperty(n => n.SendStatus, SendStatus.Sent), ct);
    }
}
