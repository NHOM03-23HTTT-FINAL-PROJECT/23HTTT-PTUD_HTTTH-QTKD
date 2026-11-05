using QTKD.Application.Features.Notifications;
using QTKD.Domain.Notifications;

namespace QTKD.Application.Common.Interfaces;

/// <summary>
/// Data access for qtkd.notification. Every method is scoped to the recipient, so another user's notification
/// cannot be listed, counted or marked. Reading and marking change personal read-state only.
/// </summary>
public interface INotificationRepository
{
    /// <summary>One page, newest first. Total counts rows matching the filter; Unread counts all unread rows.</summary>
    Task<(IReadOnlyList<NotificationRecord> Items, int Total, int Unread)> ListAsync(
        Guid recipient, NotificationQuery query, CancellationToken ct);

    Task<int> CountUnreadAsync(Guid recipient, CancellationToken ct);

    /// <summary>Marks one notification read; null when it is missing or belongs to someone else.</summary>
    Task<NotificationRecord?> MarkReadAsync(Guid recipient, Guid id, CancellationToken ct);

    /// <summary>Returns the number of rows that changed from unread to read.</summary>
    Task<int> MarkAllReadAsync(Guid recipient, CancellationToken ct);
}

/// <summary>A notification entity plus the title of the record it points to (contracts only today).</summary>
public sealed record NotificationRecord(Notification Entity, string? RecordTitle);
