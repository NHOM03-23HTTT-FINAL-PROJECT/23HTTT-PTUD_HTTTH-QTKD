using Microsoft.EntityFrameworkCore;
using QTKD.Application.Common.Interfaces;
using QTKD.Application.Features.Notifications;
using QTKD.Domain.Notifications;
using QTKD.Infrastructure.Persistence;

namespace QTKD.Infrastructure.Repositories;

/// <summary>qtkd.notification through EF Core LINQ. Every query filters on the recipient.</summary>
public sealed class NotificationRepository(QtkdDbContext db) : INotificationRepository
{
    public async Task<(IReadOnlyList<NotificationRecord> Items, int Total, int Unread)> ListAsync(
        Guid recipient, NotificationQuery query, CancellationToken ct)
    {
        var mine = db.Notifications.AsNoTracking().Where(n => n.RecipientId == recipient);
        var filtered = query.UnreadOnly ? mine.Where(n => !n.IsRead) : mine;

        var total = await filtered.CountAsync(ct);
        var unread = await mine.CountAsync(n => !n.IsRead, ct);
        var items = await WithTitle(filtered
                .OrderByDescending(n => n.CreatedAt)
                .ThenByDescending(n => n.NotificationId)
                .Skip((query.Page - 1) * query.PageSize)
                .Take(query.PageSize))
            .ToListAsync(ct);
        return (items, total, unread);
    }

    public Task<int> CountUnreadAsync(Guid recipient, CancellationToken ct) =>
        db.Notifications.CountAsync(n => n.RecipientId == recipient && !n.IsRead, ct);

    public async Task<NotificationRecord?> MarkReadAsync(Guid recipient, Guid id, CancellationToken ct)
    {
        // The recipient is part of the predicate: another user's notification behaves as missing.
        var target = db.Notifications.Where(n => n.NotificationId == id && n.RecipientId == recipient);
        if (await target.ExecuteUpdateAsync(s => s.SetProperty(n => n.IsRead, true), ct) == 0) return null;
        return await WithTitle(target.AsNoTracking()).SingleOrDefaultAsync(ct);
    }

    public Task<int> MarkAllReadAsync(Guid recipient, CancellationToken ct) =>
        db.Notifications.Where(n => n.RecipientId == recipient && !n.IsRead)
            .ExecuteUpdateAsync(s => s.SetProperty(n => n.IsRead, true), ct);

    // RecordTitle is a list label only. Only contracts have one today; other record types return null.
    private IQueryable<NotificationRecord> WithTitle(IQueryable<Notification> source) => source.Select(n => new NotificationRecord(
        n,
        n.RecordType == RecordType.Contract
            ? db.Contracts.Where(k => k.ContractId == n.RecordId).Select(k => k.Title).FirstOrDefault()
            : null));
}
