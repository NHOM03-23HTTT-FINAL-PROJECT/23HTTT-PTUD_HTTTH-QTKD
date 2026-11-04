using QTKD.Application.Common.Interfaces;
using QTKD.Domain.Contracts;

namespace QTKD.Application.Features.Notifications;

/// <summary>UC-CHUNG-05. Every call is scoped to the signed-in actor; there is no way to name another recipient.</summary>
public class NotificationService
{
    private readonly INotificationStore _store;

    public NotificationService(INotificationStore store)
    {
        _store = store;
    }

    public Task<NotificationPage> List(Actor actor, NotificationListQuery request, CancellationToken ct) =>
        _store.List(actor.Id, NotificationValidator.Query(request), ct);

    public async Task<UnreadCountResult> UnreadCount(Actor actor, CancellationToken ct) =>
        new(await _store.UnreadCount(actor.Id, ct));

    /// <summary>Another user's notification is reported as missing, not as forbidden.</summary>
    public async Task<NotificationItem> MarkRead(Actor actor, Guid id, CancellationToken ct) =>
        await _store.MarkRead(actor.Id, id, ct) ?? throw new BusinessException("NOT_FOUND", 404);

    public async Task<MarkAllReadResult> MarkAllRead(Actor actor, CancellationToken ct) =>
        new(await _store.MarkAllRead(actor.Id, ct));
}
