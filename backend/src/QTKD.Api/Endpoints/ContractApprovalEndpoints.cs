using System.Security.Claims;
using QTKD.Application.Features.ContractApprovals;
using QTKD.Infrastructure.ContractApprovals;

namespace QTKD.Api.Endpoints;

public static class ContractApprovalEndpoints
{
    public static void MapContractApprovals(this WebApplication app, string[] origins)
    {
        static Guid Actor(HttpContext c) => Guid.Parse(c.User.FindFirstValue("sub")!);
        string Write(HttpContext c)
        {
            if (c.Request.Headers["X-QTKD-CSRF"] != "1" || !origins.Contains(c.Request.Headers.Origin.ToString(), StringComparer.Ordinal))
                throw new ReviewFailure(403, "CSRF_REJECTED");
            return c.Request.Headers["Idempotency-Key"].ToString();
        }
        var group = app.MapGroup("/api/v1/approvals").RequireAuthorization();
        group.MapGet("/inbox", async (string step, bool? done, HttpContext c, ContractApprovalService service, CancellationToken ct)
            => Results.Ok(await service.Inbox(Actor(c), step, done ?? false, ct)));
        group.MapGet("/contracts/{id:guid}", async (Guid id, string step, HttpContext c, ContractApprovalService service, CancellationToken ct)
            => Results.Ok(await service.Read(Actor(c), id, step, ct)));
        group.MapPost("/contracts/{id:guid}/accept", async (Guid id, ReviewRequest request, HttpContext c, ContractApprovalService service, CancellationToken ct)
            => Results.Ok(await service.Accept(Actor(c), id, request, Write(c), ct)));
        group.MapPost("/contracts/{id:guid}/decisions", async (Guid id, DecisionRequest request, HttpContext c, ContractApprovalService service, CancellationToken ct)
            => Results.Ok(await service.Decide(Actor(c), id, request, Write(c), ct)));
        group.MapPost("/contracts/{id:guid}/handoff", async (Guid id, ReviewRequest request, HttpContext c, ContractApprovalService service, CancellationToken ct)
            => Results.Ok(await service.Handoff(Actor(c), id, request, Write(c), ct)));
        group.MapPost("/contracts/{id:guid}/pending-task/retry", async (Guid id, string step, HttpContext c, ContractApprovalService service, CancellationToken ct)
            => Results.Ok(await service.Retry(Actor(c), id, step, Write(c), ct)));
        group.MapGet("/coordination-inbox", async (HttpContext c, ContractCoordinationService service, CancellationToken ct)
            => Results.Ok(await service.List(Actor(c), null, ct)));
        group.MapGet("/contracts/{id:guid}/coordination", async (Guid id, HttpContext c, ContractCoordinationService service, CancellationToken ct)
            => Results.Ok(await service.List(Actor(c), id, ct)));
        group.MapPost("/contracts/{id:guid}/coordination", async (Guid id, CoordinationRequest request, HttpContext c, ContractCoordinationService service, CancellationToken ct)
            => { Write(c); return Results.Ok(await service.Request(Actor(c), id, request, ct)); });
        group.MapPost("/contracts/{id:guid}/coordination/{coordinationId:guid}/reply", async (Guid id, Guid coordinationId, CoordinationReply request, HttpContext c, ContractCoordinationService service, CancellationToken ct)
            => { Write(c); return Results.Ok(await service.Reply(Actor(c), id, coordinationId, request.Reply, ct)); });
    }
    public sealed record CoordinationReply(string Reply);
}
