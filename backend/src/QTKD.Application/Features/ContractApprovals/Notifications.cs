using System.Text.RegularExpressions;

namespace QTKD.Application.Features.ContractApprovals;

/// <summary>
/// Message templates and the notification kind read back from them. The kind is not stored: it is
/// derived from the content, so every producer must build content through these templates.
/// The kind is a display label only; which screen and actions to show is decided by the record's current state.
/// </summary>
public static partial class NotificationKinds
{
    public const string General = "General";
    public const string ReviewAssigned = "ReviewAssigned";
    public const string AssignmentRevoked = "AssignmentRevoked";
    public const string ReviewRequired = "ReviewRequired";
    public const string ApprovalResult = "ApprovalResult";
    public const string RevisionRequested = "RevisionRequested";

    public static string Assigned(string stepLabel, string title) => $"Bạn được phân công {stepLabel} hồ sơ {title}.";
    public static string Revoked(string stepLabel, string title) => $"Bạn không còn được phân công {stepLabel} hồ sơ {title}.";
    public static string Decision(string title, string status, string? comment) => $"Hồ sơ {title}: {status}. {comment}";

    /// <summary>Kind of a stored content. Unknown text (e.g. seed or older messages) is General.</summary>
    public static string Of(string content)
    {
        if (content.StartsWith("Bạn không còn được phân công ", StringComparison.Ordinal)) return AssignmentRevoked;
        if (content.StartsWith("Bạn được phân công ", StringComparison.Ordinal)) return ReviewAssigned;
        var decision = DecisionPattern().Match(content);
        if (!decision.Success) return General;
        return decision.Groups[1].Value switch
        {
            "under-review" => ReviewRequired,
            "revision-requested" => RevisionRequested,
            _ => ApprovalResult,
        };
    }

    [GeneratedRegex(@"^Hồ sơ .*?: (under-review|approved|rejected|revision-requested)\. ", RegexOptions.Singleline)]
    private static partial Regex DecisionPattern();
}

/// <summary>
/// One inbox row. RecordTitle is a display label only; opening the record still goes through that
/// record's own API, which checks access and existence (E1/E2).
/// </summary>
public sealed record NotificationItem(Guid Id, string Kind, string RecordType, Guid RecordId, string? RecordTitle,
    string Content, bool IsRead, DateTime CreatedAt);

public sealed record NotificationQuery(bool UnreadOnly, int Page, int PageSize)
{
    public const int MaxPageSize = 100;
    public const int DefaultPageSize = 20;
    public static NotificationQuery From(string? filter, int? page, int? pageSize)
    {
        var unread = filter switch { null or "" or "all" => false, "unread" => true, _ => throw new ReviewFailure(400, "VALIDATION") };
        var p = page ?? 1;
        var size = pageSize ?? DefaultPageSize;
        if (p < 1 || size < 1 || size > MaxPageSize) throw new ReviewFailure(400, "VALIDATION");
        return new(unread, p, size);
    }
}

/// <summary>Total counts rows matching the filter; UnreadCount is always over all of the caller's notifications.</summary>
public sealed record NotificationPage(IReadOnlyList<NotificationItem> Items, int Total, int UnreadCount, int Page, int PageSize);

/// <summary>
/// In-app inbox of the caller. The durable row is the delivery, so reading and marking are personal
/// read-state changes only: they never touch approval, contract or audit state, and every statement
/// is scoped to the recipient so another user's notification cannot be listed, counted or marked.
/// </summary>
public interface INotificationStore
{
    Task<NotificationPage> Notifications(Guid actor, NotificationQuery query, CancellationToken ct);
    Task<int> UnreadCount(Guid actor, CancellationToken ct);
    /// <summary>Marks one notification read. Throws 404 NOT_FOUND when it is missing or belongs to someone else.</summary>
    Task<NotificationItem> MarkRead(Guid actor, Guid id, CancellationToken ct);
    Task<int> MarkAllRead(Guid actor, CancellationToken ct);
}
