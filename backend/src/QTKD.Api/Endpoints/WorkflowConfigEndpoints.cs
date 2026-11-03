using System.Security.Claims;
using QTKD.Application.Features.WorkflowConfigs;

namespace QTKD.Api.Endpoints;

public static class WorkflowConfigEndpoints
{
    public static void MapWorkflowConfigs(this WebApplication app, string[] allowedOrigins)
    {
        var group = app.MapGroup("/api/v1/workflow-configs").RequireAuthorization("workflows.manage");

        group.MapGet("", List);
        group.MapGet("/participants", Participants);
        group.MapGet("/{code}", Get);

        group.MapPost("/check", (CheckWorkflowRequest request, HttpContext context, WorkflowConfigService service, CancellationToken ct)
            => Check(request, context, service, allowedOrigins, ct));
        group.MapPost("", (CreateWorkflowRequest request, HttpContext context, WorkflowConfigService service, CancellationToken ct)
            => Create(request, context, service, allowedOrigins, ct));
        group.MapPost("/{code}/versions", (string code, UpdateWorkflowRequest request, HttpContext context, WorkflowConfigService service, CancellationToken ct)
            => Update(code, request, context, service, allowedOrigins, ct));
    }

    private static async Task<IResult> List(WorkflowConfigService service, CancellationToken ct)
        => Results.Ok(await service.List(ct));

    private static async Task<IResult> Participants(WorkflowConfigService service, CancellationToken ct)
        => Results.Ok(await service.Catalog(ct));

    private static async Task<IResult> Get(string code, WorkflowConfigService service, CancellationToken ct)
        => Results.Ok(await service.Get(code, ct));

    private static async Task<IResult> Check(CheckWorkflowRequest request, HttpContext context,
        WorkflowConfigService service, string[] allowedOrigins, CancellationToken ct)
    {
        RequireCsrf(context, allowedOrigins);
        return Results.Ok(await service.Check(request, ct));
    }

    private static async Task<IResult> Create(CreateWorkflowRequest request, HttpContext context,
        WorkflowConfigService service, string[] allowedOrigins, CancellationToken ct)
    {
        RequireCsrf(context, allowedOrigins);
        return Results.Ok(await service.Create(ActorId(context), IdempotencyKey(context), request, ct));
    }

    private static async Task<IResult> Update(string code, UpdateWorkflowRequest request, HttpContext context,
        WorkflowConfigService service, string[] allowedOrigins, CancellationToken ct)
    {
        RequireCsrf(context, allowedOrigins);
        return Results.Ok(await service.Update(ActorId(context), IdempotencyKey(context), code, request, ct));
    }

    private static Guid ActorId(HttpContext context) => Guid.Parse(context.User.FindFirstValue("sub")!);

    private static string IdempotencyKey(HttpContext context) => context.Request.Headers["Idempotency-Key"].ToString();

    private static void RequireCsrf(HttpContext context, string[] allowedOrigins)
    {
        var hasHeader = context.Request.Headers["X-QTKD-CSRF"] == "1";
        var originAllowed = allowedOrigins.Contains(context.Request.Headers.Origin.ToString(), StringComparer.Ordinal);
        if (!hasHeader || !originAllowed) throw new WorkflowConfigFailure(403, "CSRF_REJECTED");
    }
}
