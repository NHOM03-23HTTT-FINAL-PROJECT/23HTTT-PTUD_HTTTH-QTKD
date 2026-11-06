using System.Text.Json;

namespace QTKD.Application.Features.Audit;

/// <summary>Raw query string of GET /audit-logs. Times are ISO 8601; no offset means UTC.</summary>
public sealed class AuditLogListQuery
{
    public string? From { get; init; }
    public string? To { get; init; }
    public string? ActorId { get; init; }
    public string? EntityType { get; init; }
    public string? EntityId { get; init; }
    public string? Action { get; init; }
    public int? Page { get; init; }
    public int? PageSize { get; init; }
}

/// <summary>
/// Validated filter. From/To are null only for a record-scoped search (entityId given) without explicit dates.
/// </summary>
public sealed record AuditQuery(DateTime? From, DateTime? To, Guid? ActorId, string? EntityType, Guid? EntityId,
    string? Action, int Page, int PageSize)
{
    public const int DefaultPageSize = 20;
    public const int MaxPageSize = 100;
    public const int MaxTextLength = 100;
    public static readonly TimeSpan DefaultRange = TimeSpan.FromDays(7);

    /// <summary>Upper bound of an unscoped search window; the UC gives no value, one year is a team assumption.</summary>
    public static readonly TimeSpan MaxRange = TimeSpan.FromDays(366);
}

public sealed record AuditLogItem(Guid Id, DateTime ActedAt, Guid? ActorId, string? ActorName, string Action,
    string EntityType, Guid? EntityId, string? StatusBefore, string? StatusAfter, string? IpAddress, string? EntityCode);

/// <summary>The applied From/To are returned so the screen shows the window actually searched.</summary>
public sealed record AuditLogPage(IReadOnlyList<AuditLogItem> Items, int Total, int Page, int PageSize, DateTime? From, DateTime? To);

public sealed record AuditFieldChange(string Field, JsonElement? Before, JsonElement? After);

public sealed record AuditLogDetail(Guid Id, DateTime ActedAt, Guid? ActorId, string? ActorName, string Action,
    string EntityType, Guid? EntityId, string? StatusBefore, string? StatusAfter, string? IpAddress, string? EntityCode, string? Note,
    IReadOnlyList<AuditFieldChange> Changes, JsonElement? ValueBefore, JsonElement? ValueAfter);

public sealed record AuditActorOption(Guid Id, string Name);

public sealed record AuditFilterOptions(IReadOnlyList<string> EntityTypes, IReadOnlyList<string> Actions, IReadOnlyList<AuditActorOption> Actors);

public static class AuditActions
{
    public const string Search = "AUDIT_SEARCHED";
    public const string View = "AUDIT_VIEWED";
    public const string MutationRejected = "AUDIT_MUTATION_REJECTED";

    /// <summary>entity_type of rows that record work on the audit log itself.</summary>
    public const string EntityType = "AuditLog";
}
