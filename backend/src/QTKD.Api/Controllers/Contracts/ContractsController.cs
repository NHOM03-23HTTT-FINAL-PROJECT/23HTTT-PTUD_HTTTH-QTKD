using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using QTKD.Application.Features.Contracts;
using QTKD.Domain.Contracts;
using QTKD.Application.Common.Interfaces;

namespace QTKD.Api.Controllers.Contracts;

[ApiController]
[Authorize(Policy = "contracts.view")]
[Route("api/v1/contracts")]
public class ContractsController : ControllerBase
{
    private readonly ContractService _service;
    private readonly ICurrentActor _actor;
    private string Key =>
        ContractService.Key(Request.Headers["Idempotency-Key"].FirstOrDefault());

    public ContractsController(ContractService service, ICurrentActor actor)
    {
        _service = service;
        _actor = actor;
    }

    [HttpGet("form-options")]
    public async Task<System.Text.Json.Nodes.JsonObject> Options(CancellationToken ct) =>
        await _service.Options(await _actor.Get(ct), ct);

    [HttpGet("filter-options")]
    public async Task<System.Text.Json.Nodes.JsonObject> Filters(CancellationToken ct) =>
        await _service.Filters(await _actor.Get(ct), ct);

    [HttpGet]
    public async Task<System.Text.Json.Nodes.JsonObject> List(
        [FromQuery] ContractQuery query,
        CancellationToken ct
        ) =>
        await _service.List(
            await _actor.Get(ct), query, ct);

    [HttpGet("{code}")]
    public async Task<object> Get(string code, CancellationToken ct) =>
        await _service.Get(
            await _actor.Get(ct), code, ct);

    [HttpPost]
    [Authorize(Policy = "contracts.create")]
    public async Task<System.Text.Json.Nodes.JsonObject> Create(
        CreateContract request,
        CancellationToken ct
        ) =>
        await _service.Create(
            await _actor.Get(ct), request, Key, ct);

    [HttpPut("{code}")]
    [Authorize(Policy = "contracts.create")]
    public async Task<System.Text.Json.Nodes.JsonObject> Update(
        string code,
        UpdateContract request,
        CancellationToken ct
        ) =>
        await _service.Update(
            await _actor.Get(ct), code, request, ct);

    [HttpPost("{code}/cancel")]
    [Authorize(Policy = "contracts.create")]
    public async Task<System.Text.Json.Nodes.JsonObject> Cancel(
        string code,
        CancelContract request,
        CancellationToken ct
        ) =>
        await _service.Cancel(
            await _actor.Get(ct), code, request, Key, ct);

    [HttpPost("{code}/cancellation-requests")]
    [Authorize(Policy = "contracts.create")]
    public async Task<System.Text.Json.Nodes.JsonObject> RequestCancellation(
        string code,
        CancellationDraft request,
        CancellationToken ct
        ) =>
        await _service.RequestCancellation(
            await _actor.Get(ct), code, request, Key, ct);

    [HttpPost("{code}/cancellation-requests/{id:guid}/decision")]
    [Authorize(Policy = "approvals.approve")]
    public async Task<System.Text.Json.Nodes.JsonObject> Decide(
        string code,
        Guid id,
        CancellationDecision request,
        CancellationToken ct
        ) =>
        await _service.DecideCancellation(
            await _actor.Get(ct), code, id, request, Key, ct);

    [HttpPost("{code}/attachments")]
    [Authorize(Policy = "contracts.create")]
    [RequestSizeLimit(21 * 1024 * 1024)]
    public async Task<object> Upload(string code, IFormFile file, [FromForm] int baseVersion, CancellationToken ct)
    {
        await using var stream = file.OpenReadStream();
        return await _service.Upload(
            await _actor.Get(ct), code, baseVersion, Key, stream, file.FileName, file.Length, ct);
    }

    [HttpDelete("{code}/attachments/{id:guid}")]
    [Authorize(Policy = "contracts.create")]
    public async Task<System.Text.Json.Nodes.JsonObject> Delete(
        string code,
        Guid id,
        [FromQuery] int baseVersion,
        CancellationToken ct
        ) =>
        await _service.RemoveFile(
            await _actor.Get(ct), code, id, baseVersion, Key, ct);

    [HttpGet("{code}/attachments/{id:guid}")]
    public async Task<IActionResult> Download(string code, Guid id, CancellationToken ct)
    {
        var result = await _service.Download(await _actor.Get(ct), code, id, ct);
        Response.Headers.XContentTypeOptions = "nosniff";
        return File(result.Content, "application/octet-stream", result.File.Name);
    }
}
