using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using QTKD.Api.Filters;
using QTKD.Application.Common.Interfaces;
using QTKD.Application.Features.Notifications;

namespace QTKD.Api.Controllers.Notifications;

/// <summary>In-app notification inbox (UC-CHUNG-05). Read-state only: no approval, contract or audit write.</summary>
[ApiController]
[Authorize]
[Route("api/v1/notifications")]
public class NotificationsController : ControllerBase
{
    private readonly NotificationService _service;
    private readonly ICurrentActor _actor;

    public NotificationsController(NotificationService service, ICurrentActor actor)
    {
        _service = service;
        _actor = actor;
    }

    // Newest first (bước 2, A1).
    [HttpGet]
    public async Task<NotificationPage> List([FromQuery] NotificationListQuery query, CancellationToken ct) =>
        await _service.List(await _actor.Get(ct), query, ct);

    [HttpGet("unread-count")]
    public async Task<UnreadCountResult> UnreadCount(CancellationToken ct) =>
        await _service.UnreadCount(await _actor.Get(ct), ct);

    [HttpPost("{id:guid}/read")]
    [RequireCsrf]
    public async Task<NotificationItem> MarkRead(Guid id, CancellationToken ct) =>
        await _service.MarkRead(await _actor.Get(ct), id, ct);

    [HttpPost("read-all")]
    [RequireCsrf]
    public async Task<MarkAllReadResult> MarkAllRead(CancellationToken ct) =>
        await _service.MarkAllRead(await _actor.Get(ct), ct);
}
