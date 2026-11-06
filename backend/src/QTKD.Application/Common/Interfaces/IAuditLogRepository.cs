using QTKD.Application.Features.Audit;

namespace QTKD.Application.Common.Interfaces;

/// <summary>
/// Read access to qtkd.audit_log plus append. There is deliberately no update or delete:
/// the table is append-only in the database as well (trigger audit_append_only).
/// </summary>
public interface IAuditLogRepository
{
    /// <summary>One page, newest first; Total counts all rows matching the filter.</summary>
    Task<(IReadOnlyList<AuditLogRecord> Items, int Total)> SearchAsync(AuditQuery query, CancellationToken ct);

    Task<AuditLogRecord?> FindAsync(Guid id, CancellationToken ct);

    /// <summary>Distinct entity types and actions in the log, and the users who appear as actors.</summary>
    Task<AuditFilterOptions> OptionsAsync(CancellationToken ct);

    Task AppendAsync(AuditEntry entry, CancellationToken ct);
}

/// <summary>A stored row with the actor's name; ValueBefore/ValueAfter are raw JSON text.</summary>
public sealed record AuditLogRecord(Guid Id, DateTime ActedAt, Guid? ActorId, string? ActorName, string Action,
    string EntityType, Guid? EntityId, string? StatusBefore, string? StatusAfter, string? ValueBefore, string? ValueAfter,
    string? Note, string? IpAddress);

/// <summary>A new row; ValueAfter is serialized to JSON. ActedAt is set by the database.</summary>
public sealed record AuditEntry(Guid ActorId, string Action, string EntityType, Guid? EntityId, object? ValueAfter, string? IpAddress);
