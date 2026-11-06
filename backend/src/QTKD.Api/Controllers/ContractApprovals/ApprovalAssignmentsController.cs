using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using QTKD.Api.Filters;
using QTKD.Application.Common.Interfaces;
using QTKD.Application.Features.ContractApprovals;

namespace QTKD.Api.Controllers.ContractApprovals;

[ApiController]
[Authorize(Policy = "approvals.assign")]
[Route("api/v1/approvals")]
public class ApprovalAssignmentsController : ControllerBase
{
    private readonly ApprovalAssignmentService _service;
    private readonly ICurrentActor _actor;

    public ApprovalAssignmentsController(ApprovalAssignmentService service, ICurrentActor actor)
    {
        _service = service;
        _actor = actor;
    }

    [HttpGet("assignments")]
    public async Task<IReadOnlyList<AssignmentItem>> Board(CancellationToken ct) =>
        await _service.Board(await _actor.Get(ct), ct);

    [HttpGet("contracts/{id:guid}/candidates")]
    public async Task<IReadOnlyList<AssignmentCandidate>> Candidates(Guid id, [FromQuery] string step, CancellationToken ct) =>
        await _service.Candidates(await _actor.Get(ct), id, step, ct);

    [HttpPost("contracts/{id:guid}/assignment")]
    [RequireCsrf]
    public async Task<ReviewDocument> Assign(Guid id, AssignReviewRequest request, CancellationToken ct) =>
        await _service.Assign(await _actor.Get(ct), id, request, ct);
}
