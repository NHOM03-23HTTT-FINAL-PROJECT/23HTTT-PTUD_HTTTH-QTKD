using Npgsql;
using QTKD.Application.Common.Interfaces;
using QTKD.Application.Features.Notifications;
using QTKD.Domain.Notifications;

namespace QTKD.Infrastructure.Persistence;

/// <summary>qtkd.notification (Prisma-owned). Every statement filters on recipient_id.</summary>
public class PostgresNotificationStore : INotificationStore
{
    private readonly PgDatabase _db;

    public PostgresNotificationStore(PgDatabase db)
    {
        _db = db;
    }

    // RecordTitle is a list label only. Only contracts have one today; other record types return null.
    private const string Columns = """
        n.notification_id, n.record_type::text, n.record_id,
        CASE WHEN n.record_type='Contract' THEN (SELECT k.title FROM qtkd.contract k WHERE k.contract_id=n.record_id) END,
        n.content, n.is_read, n.created_at
        """;

    public async Task<NotificationPage> List(Guid recipient, NotificationQuery query, CancellationToken ct)
    {
        await using var c = await _db.Open(ct);
        long total, unread;
        await using (var counts = PgDatabase.Command(c, null, """
            SELECT count(*) FILTER (WHERE NOT $2 OR is_read=false), count(*) FILTER (WHERE is_read=false)
            FROM qtkd.notification WHERE recipient_id=$1
            """, recipient, query.UnreadOnly))
        await using (var r = await counts.ExecuteReaderAsync(ct))
        {
            await r.ReadAsync(ct);
            total = r.GetInt64(0);
            unread = r.GetInt64(1);
        }

        await using var cmd = PgDatabase.Command(c, null, $"""
            SELECT {Columns} FROM qtkd.notification n
            WHERE n.recipient_id=$1 AND (NOT $2 OR n.is_read=false)
            ORDER BY n.created_at DESC, n.notification_id DESC LIMIT $3 OFFSET $4
            """, recipient, query.UnreadOnly, query.PageSize, (query.Page - 1) * query.PageSize);
        var items = new List<NotificationItem>();
        await using (var r = await cmd.ExecuteReaderAsync(ct))
        {
            while (await r.ReadAsync(ct))
            {
                items.Add(Read(r));
            }
        }

        return new NotificationPage(items, checked((int)total), checked((int)unread), query.Page, query.PageSize);
    }

    public async Task<int> UnreadCount(Guid recipient, CancellationToken ct)
    {
        await using var c = await _db.Open(ct);
        await using var cmd = PgDatabase.Command(c, null,
            "SELECT count(*) FROM qtkd.notification WHERE recipient_id=$1 AND is_read=false", recipient);
        return checked((int)(long)(await cmd.ExecuteScalarAsync(ct))!);
    }

    public async Task<NotificationItem?> MarkRead(Guid recipient, Guid id, CancellationToken ct)
    {
        await using var c = await _db.Open(ct);
        // recipient_id is part of the predicate: another user's row behaves as missing.
        await using var cmd = PgDatabase.Command(c, null, $"""
            UPDATE qtkd.notification n SET is_read=true WHERE n.notification_id=$1 AND n.recipient_id=$2
            RETURNING {Columns}
            """, id, recipient);
        await using var r = await cmd.ExecuteReaderAsync(ct);
        return await r.ReadAsync(ct) ? Read(r) : null;
    }

    public async Task<int> MarkAllRead(Guid recipient, CancellationToken ct)
    {
        await using var c = await _db.Open(ct);
        return await PgDatabase.Execute(c, null,
            "UPDATE qtkd.notification SET is_read=true WHERE recipient_id=$1 AND is_read=false", ct, recipient);
    }

    private static NotificationItem Read(NpgsqlDataReader r) => new(r.GetGuid(0), NotificationKinds.Of(r.GetString(4)),
        r.GetString(1), r.GetGuid(2), r.IsDBNull(3) ? null : r.GetString(3), r.GetString(4), r.GetBoolean(5), r.GetDateTime(6));
}
