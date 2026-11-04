namespace QTKD.Application.Features.Notifications;

/// <summary>Query string of GET /api/v1/notifications: ?filter=all|unread&amp;page=1&amp;pageSize=20.</summary>
public class NotificationListQuery
{
    public string? Filter { get; set; }
    public int? Page { get; set; }
    public int? PageSize { get; set; }
}

/// <summary>Validated list filter passed to the store (see NotificationValidator).</summary>
public sealed record NotificationQuery(bool UnreadOnly, int Page, int PageSize)
{
    public const int MaxPageSize = 100;
    public const int DefaultPageSize = 20;
}

/// <summary>
/// One inbox row. RecordTitle is a display label only; opening the record still goes through that
/// record's own API, which checks access and existence (UC-CHUNG-05 E1/E2).
/// </summary>
public sealed record NotificationItem(Guid Id, string Kind, string RecordType, Guid RecordId, string? RecordTitle,
    string Content, bool IsRead, DateTime CreatedAt);

/// <summary>Total counts rows matching the filter; UnreadCount is always over all of the caller's notifications.</summary>
public sealed record NotificationPage(IReadOnlyList<NotificationItem> Items, int Total, int UnreadCount, int Page, int PageSize);

public sealed record UnreadCountResult(int Count);

public sealed record MarkAllReadResult(int Updated);
