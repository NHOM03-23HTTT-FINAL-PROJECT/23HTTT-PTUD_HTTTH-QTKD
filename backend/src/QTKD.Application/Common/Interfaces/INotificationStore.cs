using QTKD.Application.Features.Notifications;

namespace QTKD.Application.Common.Interfaces;

/// <summary>
/// In-app inbox of the caller. The durable row is the delivery, so reading and marking are personal
/// read-state changes only: they never touch approval, contract or audit state, and every statement
/// is scoped to the recipient so another user's notification cannot be listed, counted or marked.
/// </summary>
public interface INotificationStore
{
    Task<NotificationPage> List(Guid recipient, NotificationQuery query, CancellationToken ct);

    Task<int> UnreadCount(Guid recipient, CancellationToken ct);

    /// <summary>Marks one notification read; null when it is missing or belongs to someone else.</summary>
    Task<NotificationItem?> MarkRead(Guid recipient, Guid id, CancellationToken ct);

    Task<int> MarkAllRead(Guid recipient, CancellationToken ct);
}
