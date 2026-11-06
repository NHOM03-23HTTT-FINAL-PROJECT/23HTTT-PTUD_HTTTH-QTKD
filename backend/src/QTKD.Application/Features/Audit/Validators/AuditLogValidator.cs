using System.Globalization;
using QTKD.Domain.Contracts;

namespace QTKD.Application.Features.Audit;

public static class AuditLogValidator
{
    /// <summary>
    /// Defaults to the last 7 days, first page, 20 rows. A record-scoped search (entityId) has no default window;
    /// explicit dates still apply. Any invalid field is 400 VALIDATION with { field, reason }.
    /// </summary>
    public static AuditQuery Query(AuditLogListQuery request, DateTime now)
    {
        var from = Time(request.From, "from");
        var to = Time(request.To, "to");
        var actor = OptionalGuid(request.ActorId, "actorId");
        var entity = OptionalGuid(request.EntityId, "entityId");
        var type = OptionalText(request.EntityType, "entityType");
        var action = OptionalText(request.Action, "action");
        var page = request.Page ?? 1;
        var size = request.PageSize ?? AuditQuery.DefaultPageSize;
        if (page < 1) throw Invalid("page", "OUT_OF_RANGE");
        if (size < 1 || size > AuditQuery.MaxPageSize) throw Invalid("pageSize", "OUT_OF_RANGE");

        if (entity is null)
        {
            // Missing end means "until now"; missing start means 7 days before the end.
            to ??= now;
            from ??= to - AuditQuery.DefaultRange;
        }
        if (from is not null && to is not null)
        {
            if (to < from) throw Invalid("to", "RANGE_INVERTED");
            if (entity is null && to - from > AuditQuery.MaxRange) throw Invalid("from", "RANGE_TOO_LONG");
        }
        return new(from, to, actor, type, entity, action, page, size);
    }

    private static DateTime? Time(string? value, string field)
    {
        if (string.IsNullOrWhiteSpace(value)) return null;
        return DateTimeOffset.TryParse(value.Trim(), CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal, out var time)
            ? time.UtcDateTime
            : throw Invalid(field, "INVALID_DATE");
    }

    private static Guid? OptionalGuid(string? value, string field)
    {
        if (string.IsNullOrWhiteSpace(value)) return null;
        return Guid.TryParse(value.Trim(), out var id) ? id : throw Invalid(field, "INVALID_ID");
    }

    private static string? OptionalText(string? value, string field)
    {
        if (string.IsNullOrWhiteSpace(value)) return null;
        var text = value.Trim();
        return text.Length <= AuditQuery.MaxTextLength ? text : throw Invalid(field, "TOO_LONG");
    }

    private static BusinessException Invalid(string field, string reason) =>
        new("VALIDATION", 400, new { field, reason });
}
