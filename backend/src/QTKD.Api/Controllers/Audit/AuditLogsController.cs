using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using QTKD.Api.Filters;
using QTKD.Application.Common.Interfaces;
using QTKD.Application.Features.Audit;

namespace QTKD.Api.Controllers.Audit;

/// <summary>audit log search. Read-only: every change attempt is refused and recorded.</summary>
[ApiController]
[Authorize]
[Route("api/v1/audit-logs")]
public class AuditLogsController : ControllerBase
{
    private readonly AuditLogService _service;
    private readonly ICurrentActor _actor;

    public AuditLogsController(AuditLogService service, ICurrentActor actor)
    {
        _service = service;
        _actor = actor;
    }

    private string? Ip => HttpContext.Connection.RemoteIpAddress?.ToString();

    [HttpGet]
    [Authorize(Policy = "audit.view")]
    public async Task<AuditLogPage> Search([FromQuery] AuditLogListQuery query, CancellationToken ct) =>
        await _service.Search(await _actor.Get(ct), Ip, query, ct);

    [HttpGet("options")]
    [Authorize(Policy = "audit.view")]
    public async Task<AuditFilterOptions> Options(CancellationToken ct) =>
        await _service.Options(ct);

    [HttpGet("{id:guid}")]
    [Authorize(Policy = "audit.view")]
    public async Task<AuditLogDetail> Detail(Guid id, CancellationToken ct) =>
        await _service.Detail(await _actor.Get(ct), Ip, id, ct);

    // Any signed-in user's attempt is recorded, whether or not they hold audit.view.
    [AcceptVerbs("POST", "PUT", "PATCH", "DELETE")]
    [Route("")]
    [Route("{id:guid}")]
    [RequireCsrf]
    public async Task<IActionResult> Reject(Guid? id, CancellationToken ct) =>
        throw await _service.RejectMutation(await _actor.Get(ct), Ip, Request.Method, id, ct);
}
