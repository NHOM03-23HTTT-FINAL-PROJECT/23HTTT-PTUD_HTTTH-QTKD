using System.Text.RegularExpressions;

namespace QTKD.Domain.Notifications;

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
