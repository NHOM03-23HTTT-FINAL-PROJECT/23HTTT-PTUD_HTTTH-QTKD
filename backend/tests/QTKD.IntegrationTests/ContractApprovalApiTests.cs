using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using QTKD.Application.Features.ContractApprovals;
using QTKD.Domain.Identity;
using QTKD.Infrastructure.Persistence;
using Xunit;

namespace QTKD.IntegrationTests;

// Real HTTP pipeline, JWT/session, Identity and authorization. The engine is a spy only:
// these tests verify the contract module boundary, NOT upstream transitions, locks or delivery.
public sealed class ContractApprovalApiTests : IDisposable
{
    private readonly EngineSpy engine = new();
    private readonly ApiFactory factory;
    private ReviewDocument document = null!;
    public ContractApprovalApiTests() => factory = new() { ApprovalEngine = engine };
    public void Dispose() => factory.Dispose();
    private async Task<HttpClient> Setup(string step = "sales", bool grant = true)
    {
        var client = await factory.Client();
        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<IdentityDbContext>();
        var role = step switch { "legal" => UserRole.LegalStaff, "board" => UserRole.BoardMember, _ => UserRole.SalesManager };
        var account = await db.Users.SingleAsync(u => u.UserId == factory.StaffId);
        account.Role = role;
        var departmentCode = step switch { "legal" => "PC", "board" => "BGD", _ => "KD" };
        account.DepartmentId = (await db.Departments.SingleAsync(d => d.Code == departmentCode)).DepartmentId;
        if (grant) db.Grants.Add(new RolePermission { Role = role, PermissionCode = ContractApprovalService.Permission(step) });
        await db.SaveChangesAsync();
        var login = await client.PostAsJsonAsync("/api/v1/auth/login", new { identifier = factory.Prefix + ".staff", password = factory.Password });
        login.EnsureSuccessStatusCode();
        var auth = await login.Content.ReadFromJsonAsync<JsonElement>();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", auth.GetProperty("accessToken").GetString());
        client.DefaultRequestHeaders.Add("Idempotency-Key", "review-test-1");
        var order = new[] { "sales", "legal", "board" };
        var index = Array.IndexOf(order, step);
        document = new(Guid.NewGuid(), "Contract test", "Customer", "Owner", "KD", 1000, "under-review", 3,
            Guid.NewGuid(), 2, 3, "in-progress", DateTime.UtcNow,
            order.Select((key, i) => new ReviewStep(Guid.NewGuid(), key, i + 1, i == index ? factory.StaffId : Guid.NewGuid(), "Reviewer",
                i < index ? "done" : i == index ? "reviewing" : "waiting", i < index ? "approve" : null,
                i < index ? 3 : null, i < index ? "Approved previous step" : null, null)).ToArray(),
            "Content", "Payment terms", []);
        engine.Document = document;
        return client;
    }
    private DecisionRequest Decision(string step = "sales", string action = "approve", string comment = "Valid mandatory comment")
        => new(document.RoundId, document.Steps.Single(s => s.Key == step).Id, document.Version, step, action, comment);
    private async Task AssertError(HttpResponseMessage response, int status, string code)
    {
        Assert.Equal(status, (int)response.StatusCode);
        Assert.Equal(code, (await response.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("code").GetString());
    }
    [Theory]
    [InlineData("sales", "approve")]
    [InlineData("sales", "revision")]
    [InlineData("sales", "reject")]
    [InlineData("legal", "approve")]
    [InlineData("legal", "revision")]
    [InlineData("legal", "reject")]
    [InlineData("board", "approve")]
    [InlineData("board", "revision")]
    [InlineData("board", "reject")]
    public async Task Valid_decision_delegates_to_engine_with_server_actor_and_exact_snapshot(string step, string action)
    {
        using var client = await Setup(step);
        var response = await client.PostAsJsonAsync($"/api/v1/approvals/contracts/{document.Id}/decisions", Decision(step, action));
        response.EnsureSuccessStatusCode();
        var command = Assert.Single(engine.Commands);
        Assert.Equal(factory.StaffId, command.Actor.Id);
        Assert.Equal(document.RoundId, command.Expected.RoundId);
        Assert.Equal(3, command.Expected.ViewedVersion);
        Assert.Equal(action, command.Action); Assert.Equal("review-test-1", command.IdempotencyKey);
        // The module did not assign a next step or change source state itself.
        Assert.Equal("under-review", engine.Document!.Status);
    }
    [Theory]
    [InlineData("comment", 400, "VALIDATION")]
    [InlineData("decision", 400, "VALIDATION")]
    [InlineData("version", 409, "VERSION_MISMATCH")]
    [InlineData("submitted-version", 409, "VERSION_MISMATCH")]
    [InlineData("round", 409, "STEP_DONE")]
    [InlineData("closed", 409, "STEP_DONE")]
    [InlineData("done", 409, "STEP_DONE")]
    [InlineData("not-accepted", 409, "STEP_NOT_READY")]
    [InlineData("assignee", 403, "FORBIDDEN")]
    [InlineData("scope", 403, "FORBIDDEN")]
    [InlineData("role", 403, "FORBIDDEN")]
    [InlineData("key", 400, "IDEMPOTENCY_KEY_REQUIRED")]
    public async Task Invalid_requests_do_not_send_any_write_to_engine(string fault, int status, string code)
    {
        using var client = await Setup(); var request = Decision();
        switch (fault)
        {
            case "comment": request = request with { Comment = "  " }; break;
            case "decision": request = request with { Decision = "direct-approved" }; break;
            case "version": request = request with { ViewedVersion = 2 }; break;
            case "submitted-version": engine.Document = document with { SubmittedVersion = 2 }; break;
            case "round": request = request with { RoundId = Guid.NewGuid() }; break;
            case "closed": engine.Document = document with { RoundResult = "revision" }; break;
            case "done": engine.Document = document with { Steps = [document.Steps[0] with { State = "done" }, .. document.Steps.Skip(1)] }; break;
            case "not-accepted": engine.Document = document with { Status = "submitted", Steps = [document.Steps[0] with { State = "pending-accept" }, .. document.Steps.Skip(1)] }; break;
            case "assignee": engine.Document = document with { Steps = [document.Steps[0] with { AssigneeId = Guid.NewGuid() }, .. document.Steps.Skip(1)] }; break;
            case "scope": engine.Document = document with { Department = "OTHER" }; break;
            case "role": request = Decision() with { Step = "legal" }; break;
            case "key": client.DefaultRequestHeaders.Remove("Idempotency-Key"); break;
        }
        await AssertError(await client.PostAsJsonAsync($"/api/v1/approvals/contracts/{document.Id}/decisions", request), status, code);
        Assert.Empty(engine.Commands);
    }
    [Theory]
    [InlineData("legal", "unfinished")]
    [InlineData("board", "unfinished")]
    [InlineData("board", "old-version")]
    [InlineData("board", "missing")]
    [InlineData("board", "not-last")]
    [InlineData("legal", "missing-board")]
    public async Task Prior_steps_must_be_approved_in_same_version_and_board_must_be_last(string step, string fault)
    {
        using var client = await Setup(step);
        engine.Document = fault switch
        {
            "missing" => document with { Steps = document.Steps.Where(s => s.Key != "legal").ToArray() },
            "missing-board" => document with { Steps = document.Steps.Where(s => s.Key != "board").ToArray() },
            "not-last" => document with { Steps = [..document.Steps, new(Guid.NewGuid(), "legal", 4, Guid.NewGuid(), "Other", "waiting", null, null, null, null)] },
            _ => document with { Steps = [document.Steps[0] with { Decision = fault == "unfinished" ? null : "approve", ReviewedVersion = fault == "old-version" ? 2 : 3 }, .. document.Steps.Skip(1)] }
        };
        await AssertError(await client.PostAsJsonAsync($"/api/v1/approvals/contracts/{document.Id}/decisions", Decision(step)), 409, "STEP_NOT_READY");
        Assert.Empty(engine.Commands);
    }
    [Fact]
    public async Task Only_sales_can_accept_a_submitted_current_step()
    {
        using var client = await Setup();
        engine.Document = document with { Status = "submitted", Steps = [document.Steps[0] with { State = "pending-accept" }, ..document.Steps.Skip(1)] };
        var request = new ReviewRequest(document.RoundId, document.Steps[0].Id, 3, "sales");
        (await client.PostAsJsonAsync($"/api/v1/approvals/contracts/{document.Id}/accept", request)).EnsureSuccessStatusCode();
        Assert.Equal("accept", Assert.Single(engine.Commands).Action);
    }
    [Fact]
    public async Task Permission_is_required_even_for_correct_role_and_assignee()
    {
        using var client = await Setup(grant: false);
        await AssertError(await client.GetAsync("/api/v1/approvals/inbox?step=sales"), 403, "FORBIDDEN");
        await AssertError(await client.PostAsJsonAsync($"/api/v1/approvals/contracts/{document.Id}/decisions", Decision()), 403, "FORBIDDEN");
        Assert.Empty(engine.Commands); Assert.Equal(0, engine.Reads);
    }
    [Fact]
    public async Task Missing_token_and_csrf_are_rejected_before_any_write()
    {
        using var client = await Setup();
        client.DefaultRequestHeaders.Remove("X-QTKD-CSRF");
        await AssertError(await client.PostAsJsonAsync($"/api/v1/approvals/contracts/{document.Id}/decisions", Decision()), 403, "CSRF_REJECTED");
        client.DefaultRequestHeaders.Authorization = null;
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/v1/approvals/inbox?step=sales")).StatusCode);
        Assert.Empty(engine.Commands);
    }
    [Fact]
    public async Task Malformed_json_is_a_client_error_and_never_reaches_engine()
    {
        using var client = await Setup();
        var response = await client.PostAsync($"/api/v1/approvals/contracts/{document.Id}/decisions",
            new StringContent("{invalid", System.Text.Encoding.UTF8, "application/json"));
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode); Assert.Empty(engine.Commands);
    }
    [Fact]
    public async Task Upstream_conflict_is_preserved_and_retry_never_calls_decision()
    {
        using var client = await Setup("board");
        engine.Failure = new ReviewFailure(409, "STEP_DONE");
        await AssertError(await client.PostAsJsonAsync($"/api/v1/approvals/contracts/{document.Id}/decisions", Decision("board")), 409, "STEP_DONE");
        engine.Document = document with { Status = "approved", RoundResult = "completed", PendingTask = "Notification pending" };
        var response = await client.PostAsJsonAsync($"/api/v1/approvals/contracts/{document.Id}/pending-task/retry?step=board", new { });
        response.EnsureSuccessStatusCode();
        Assert.Single(engine.Commands); Assert.Equal(1, engine.Retries);
        var result = await response.Content.ReadFromJsonAsync<ReviewOutcome>();
        Assert.Equal("approved", result!.Document.Status);
    }
    [Fact]
    public async Task Inbox_filters_unassigned_or_out_of_scope_documents_and_detail_cannot_bypass_scope()
    {
        using var client = await Setup();
        var other = document with { Id = Guid.NewGuid(), Department = "OTHER" };
        engine.Items = [document, other];
        var response = await client.GetFromJsonAsync<ReviewDocument[]>("/api/v1/approvals/inbox?step=sales");
        Assert.Equal(document.Id, Assert.Single(response!).Id);
        engine.Document = other;
        await AssertError(await client.GetAsync($"/api/v1/approvals/contracts/{other.Id}?step=sales"), 403, "FORBIDDEN");
    }
    [Fact]
    public void Generic_engine_is_registered_for_production()
    {
        using var production = new ApiFactory();
        using var scope = production.Services.CreateScope();
        Assert.IsType<ContractApprovalEngine>(scope.ServiceProvider.GetRequiredService<IContractApprovalEngine>());
    }
    private sealed class EngineSpy : IContractApprovalEngine
    {
        public ReviewDocument? Document;
        public IReadOnlyList<ReviewDocument> Items = [];
        public List<ReviewCommand> Commands = [];
        public int Reads, Retries;
        public ReviewFailure? Failure;
        public Task<IReadOnlyList<ReviewDocument>> Inbox(ReviewActor actor, string step, bool done, CancellationToken ct) => Task.FromResult(Items);
        public Task<ReviewDocument?> Read(Guid id, ReviewActor actor, CancellationToken ct) { Reads++; return Task.FromResult(Document); }
        public Task<ReviewOutcome> Execute(ReviewCommand command, CancellationToken ct)
        {
            ContractApprovalService.Validate(command.Actor, Document!, command.Expected, command.Action == "accept");
            Commands.Add(command);
            if (Failure is not null) throw Failure;
            return Task.FromResult(new ReviewOutcome(Document!, Document!.PendingTask));
        }
        public Task<ReviewOutcome> RetryPending(Guid id, ReviewActor actor, string key, CancellationToken ct)
        { Retries++; return Task.FromResult(new ReviewOutcome(Document!, Document!.PendingTask)); }
    }
}
