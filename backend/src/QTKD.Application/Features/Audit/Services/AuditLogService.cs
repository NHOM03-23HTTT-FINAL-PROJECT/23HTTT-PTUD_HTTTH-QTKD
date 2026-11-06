using System.Text.Json;
using QTKD.Application.Common.Interfaces;
using QTKD.Domain.Contracts;

namespace QTKD.Application.Features.Audit;

/// <summary>
/// UC-CHUNG-06. The audit.view policy is enforced by the controller; this service validates the filter, queries,
/// and records every lookup and every rejected change attempt in the log itself.
/// </summary>
public sealed class AuditLogService(IAuditLogRepository repository, TimeProvider clock)
{
    public async Task<AuditLogPage> Search(Actor actor, string? ip, AuditLogListQuery request, CancellationToken ct)
    {
        var query = AuditLogValidator.Query(request, clock.GetUtcNow().UtcDateTime);
        var (items, total) = await repository.SearchAsync(query, ct);
        await repository.AppendAsync(new(actor.Id, AuditActions.Search, AuditActions.EntityType, null, new
        {
            query.From, query.To, query.ActorId, query.EntityType, query.EntityId, query.Action, query.Page, query.PageSize,
        }, ip), ct);
        return new(items.Select(ToItem).ToList(), total, query.Page, query.PageSize, query.From, query.To);
    }

    public Task<AuditFilterOptions> Options(CancellationToken ct) => repository.OptionsAsync(ct);

    public async Task<AuditLogDetail> Detail(Actor actor, string? ip, Guid id, CancellationToken ct)
    {
        var r = await repository.FindAsync(id, ct) ?? throw new BusinessException("NOT_FOUND", 404);
        await repository.AppendAsync(new(actor.Id, AuditActions.View, AuditActions.EntityType, id, null, ip), ct);
        var before = Json(r.ValueBefore);
        var after = Json(r.ValueAfter);
        return new(r.Id, r.ActedAt, r.ActorId, r.ActorName, r.Action, r.EntityType, r.EntityId, r.StatusBefore, r.StatusAfter,
            r.IpAddress, r.EntityCode, r.Note, Changes(r.StatusBefore, r.StatusAfter, before, after), before, after);
    }

    /// <summary>Records the attempt, then refuses with 405 AUDIT_IMMUTABLE. Nothing in the log is changed.</summary>
    public async Task<BusinessException> RejectMutation(Actor actor, string? ip, string method, Guid? target, CancellationToken ct)
    {
        await repository.AppendAsync(new(actor.Id, AuditActions.MutationRejected, AuditActions.EntityType, target, new { method }, ip), ct);
        return new BusinessException("AUDIT_IMMUTABLE", 405);
    }

    /// <summary>
    /// Top-level field differences. Objects are compared key by key (keys of before first, then keys only in after);
    /// any other shape is one "value" change. A status change is listed first.
    /// </summary>
    public static IReadOnlyList<AuditFieldChange> Changes(string? statusBefore, string? statusAfter, JsonElement? before, JsonElement? after)
    {
        var changes = new List<AuditFieldChange>();
        if (statusBefore != statusAfter)
            changes.Add(new("status", Text(statusBefore), Text(statusAfter)));
        var b = Present(before);
        var a = Present(after);
        if (b is null && a is null) return changes;
        if (b is { ValueKind: JsonValueKind.Object } || a is { ValueKind: JsonValueKind.Object })
        {
            if (b is { ValueKind: not JsonValueKind.Object } || a is { ValueKind: not JsonValueKind.Object })
            {
                changes.Add(new("value", b, a));
                return changes;
            }
            var beforeFields = b is null ? [] : b.Value.EnumerateObject().ToDictionary(p => p.Name, p => p.Value, StringComparer.Ordinal);
            var afterFields = a is null ? [] : a.Value.EnumerateObject().ToDictionary(p => p.Name, p => p.Value, StringComparer.Ordinal);
            foreach (var name in beforeFields.Keys.Concat(afterFields.Keys.Where(k => !beforeFields.ContainsKey(k))))
            {
                JsonElement? old = beforeFields.TryGetValue(name, out var x) ? x : null;
                JsonElement? next = afterFields.TryGetValue(name, out var y) ? y : null;
                if (old is not null && next is not null && JsonElement.DeepEquals(old.Value, next.Value)) continue;
                changes.Add(new(name, old, next));
            }
            return changes;
        }
        if (b is null || a is null || !JsonElement.DeepEquals(b.Value, a.Value)) changes.Add(new("value", b, a));
        return changes;
    }

    private static AuditLogItem ToItem(AuditLogRecord r) =>
        new(r.Id, r.ActedAt, r.ActorId, r.ActorName, r.Action, r.EntityType, r.EntityId, r.StatusBefore, r.StatusAfter, r.IpAddress, r.EntityCode);

    private static JsonElement? Json(string? value) => value is null ? null : JsonDocument.Parse(value).RootElement.Clone();

    private static JsonElement? Present(JsonElement? value) => value is { ValueKind: not (JsonValueKind.Undefined or JsonValueKind.Null) } ? value : null;

    private static JsonElement? Text(string? value) => value is null ? null : JsonSerializer.SerializeToElement(value);
}
