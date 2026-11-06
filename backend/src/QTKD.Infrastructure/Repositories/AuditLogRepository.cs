using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using QTKD.Application.Common.Interfaces;
using QTKD.Application.Features.Audit;
using QTKD.Infrastructure.Persistence;
using QTKD.Infrastructure.Persistence.Schema;

namespace QTKD.Infrastructure.Repositories;

/// <summary>qtkd.audit_log through EF Core LINQ. Reads only, plus INSERT for new rows; never UPDATE or DELETE.</summary>
public sealed class AuditLogRepository(QtkdDbContext db) : IAuditLogRepository
{
    private static readonly JsonSerializerOptions Web = new(JsonSerializerDefaults.Web);

    private IQueryable<AuditLog> Logs => db.Set<AuditLog>().AsNoTracking();
    private IQueryable<UserAccount> Users => db.Set<UserAccount>().AsNoTracking();

    public async Task<(IReadOnlyList<AuditLogRecord> Items, int Total)> SearchAsync(AuditQuery query, CancellationToken ct)
    {
        var logs = Logs;
        if (query.From is { } from) logs = logs.Where(l => l.ActedAt >= from);
        if (query.To is { } to) logs = logs.Where(l => l.ActedAt <= to);
        if (query.ActorId is { } actor) logs = logs.Where(l => l.ActorId == actor);
        if (query.EntityType is { } type) logs = logs.Where(l => l.EntityType == type);
        if (query.EntityId is { } entity) logs = logs.Where(l => l.EntityId == entity);
        if (query.Action is { } action) logs = logs.Where(l => l.Action == action);

        var total = await logs.CountAsync(ct);
        var items = await WithActor(logs
                .OrderByDescending(l => l.ActedAt)
                .ThenByDescending(l => l.LogId)
                .Skip((query.Page - 1) * query.PageSize)
                .Take(query.PageSize))
            .ToListAsync(ct);
        return (items, total);
    }

    public Task<AuditLogRecord?> FindAsync(Guid id, CancellationToken ct) =>
        WithActor(Logs.Where(l => l.LogId == id)).SingleOrDefaultAsync(ct);

    public async Task<AuditFilterOptions> OptionsAsync(CancellationToken ct)
    {
        var types = await Logs.Select(l => l.EntityType).Distinct().OrderBy(t => t).ToListAsync(ct);
        var actions = await Logs.Select(l => l.Action).Distinct().OrderBy(a => a).ToListAsync(ct);
        var actors = await Users
            .Where(u => Logs.Any(l => l.ActorId == u.UserId))
            .OrderBy(u => u.FullName)
            .Select(u => new AuditActorOption(u.UserId, u.FullName))
            .ToListAsync(ct);
        return new(types, actions, actors);
    }

    public async Task AppendAsync(AuditEntry entry, CancellationToken ct)
    {
        db.Add(new AuditLog
        {
            EntityType = entry.EntityType, EntityId = entry.EntityId, Action = entry.Action, ActorId = entry.ActorId,
            ValueAfter = entry.ValueAfter is null ? null : JsonSerializer.Serialize(entry.ValueAfter, Web),
            IpAddress = entry.IpAddress,
        });
        await db.SaveChangesAsync(ct);
    }

    private IQueryable<AuditLogRecord> WithActor(IQueryable<AuditLog> source) => source.Select(l => new AuditLogRecord(
        l.LogId, l.ActedAt, l.ActorId,
        Users.Where(u => u.UserId == l.ActorId).Select(u => u.FullName).FirstOrDefault(),
        l.Action, l.EntityType, l.EntityId, l.StatusBefore, l.StatusAfter, l.ValueBefore, l.ValueAfter, l.Note, l.IpAddress));
}
