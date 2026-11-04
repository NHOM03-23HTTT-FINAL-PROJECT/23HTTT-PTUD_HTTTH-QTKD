using System.Security.Claims;
using QTKD.Application.Features.ContractApprovals;

namespace QTKD.Api.Endpoints;

/// <summary>In-app notification inbox. Read-state only: no approval, contract or audit write.</summary>
public static class NotificationEndpoints
{
    public static void MapNotifications(this WebApplication app, string[] origins)
    {
        static Guid Actor(HttpContext c) => Guid.Parse(c.User.FindFirstValue("sub")!);
        void Write(HttpContext c)
        {
            if (c.Request.Headers["X-QTKD-CSRF"] != "1" || !origins.Contains(c.Request.Headers.Origin.ToString(), StringComparer.Ordinal))
                throw new ReviewFailure(403, "CSRF_REJECTED");
        }
        var group = app.MapGroup("/api/v1/notifications").RequireAuthorization();
        // ?filter=all|unread&page=1&pageSize=20 (UC-CHUNG-05 bước 2, A1). Mới nhất trước.
        group.MapGet("", async (HttpContext c, INotificationStore store, string? filter, int? page, int? pageSize, CancellationToken ct)
            => Results.Ok(await store.Notifications(Actor(c), NotificationQuery.From(filter, page, pageSize), ct)));
        group.MapGet("unread-count", async (HttpContext c, INotificationStore store, CancellationToken ct)
            => Results.Ok(new { count = await store.UnreadCount(Actor(c), ct) }));
        group.MapPost("{id:guid}/read", async (Guid id, HttpContext c, INotificationStore store, CancellationToken ct)
            => { Write(c); return Results.Ok(await store.MarkRead(Actor(c), id, ct)); });
        group.MapPost("read-all", async (HttpContext c, INotificationStore store, CancellationToken ct)
            => { Write(c); return Results.Ok(new { updated = await store.MarkAllRead(Actor(c), ct) }); });
    }
}
