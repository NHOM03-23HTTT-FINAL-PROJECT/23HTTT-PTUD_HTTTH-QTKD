namespace QTKD.Application.Features.ContractApprovals;

public sealed record NotificationItem(Guid Id, Guid RecordId, string Content, bool IsRead, DateTime CreatedAt);

/// <summary>
/// In-app inbox of the caller. The durable row is the delivery, so reading and marking are personal
/// read-state changes only: they never touch approval, contract or audit state, and every statement
/// is scoped to the recipient so another user's notification cannot be listed, counted or marked.
/// </summary>
public interface INotificationStore
{
    Task<IReadOnlyList<NotificationItem>> Notifications(Guid actor, CancellationToken ct);
    Task<int> UnreadCount(Guid actor, CancellationToken ct);
    /// <summary>Marks one notification read. Throws 404 NOT_FOUND when it is missing or belongs to someone else.</summary>
    Task<NotificationItem> MarkRead(Guid actor, Guid id, CancellationToken ct);
    Task<int> MarkAllRead(Guid actor, CancellationToken ct);
}
