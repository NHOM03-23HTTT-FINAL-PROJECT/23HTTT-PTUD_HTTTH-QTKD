using QTKD.Application.Common.Interfaces;
using QTKD.Domain.Contracts;
using QTKD.Domain.Notifications;

namespace QTKD.Application.Features.Notifications;

/// <summary>UC-CHUNG-05. Every call is scoped to the signed-in actor; there is no way to name another recipient.</summary>
public sealed class NotificationService(INotificationRepository repository)
{
    public async Task<NotificationPage> List(Actor actor, NotificationListQuery request, CancellationToken ct)
    {
        var query = NotificationValidator.Query(request);
        var (items, total, unread) = await repository.ListAsync(actor.Id, query, ct);
        return new NotificationPage(items.Select(ToItem).ToList(), total, unread, query.Page, query.PageSize);
    }

    public async Task<UnreadCountResult> UnreadCount(Actor actor, CancellationToken ct) =>
        new(await repository.CountUnreadAsync(actor.Id, ct));

    /// <summary>Another user's notification is reported as missing, not as forbidden.</summary>
    public async Task<NotificationItem> MarkRead(Actor actor, Guid id, CancellationToken ct) =>
        ToItem(await repository.MarkReadAsync(actor.Id, id, ct) ?? throw new BusinessException("NOT_FOUND", 404));

    public async Task<MarkAllReadResult> MarkAllRead(Actor actor, CancellationToken ct) =>
        new(await repository.MarkAllReadAsync(actor.Id, ct));

    // Entity → response. The kind is not stored; it is derived from the content (NotificationKinds).
    private static NotificationItem ToItem(NotificationRecord record)
    {
        var n = record.Entity;
        return new NotificationItem(n.NotificationId, NotificationKinds.Of(n.Content), n.RecordType.ToString(), n.RecordId,
            record.RecordTitle, n.Content, n.IsRead, n.CreatedAt);
    }
}
