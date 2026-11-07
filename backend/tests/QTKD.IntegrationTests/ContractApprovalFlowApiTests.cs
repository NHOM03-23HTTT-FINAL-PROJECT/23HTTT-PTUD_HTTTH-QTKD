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

public sealed class ContractApprovalFlowApiTests
{
    [Fact]
    public async Task Real_jwt_users_complete_the_http_flow_through_real_engine_and_cannot_approve_out_of_order()
    {
        var store = new MemoryApprovalStore(WorkflowEngineTests.Submitted());
        using var factory = new ApiFactory { ApprovalStore = store };
        using var sales = await factory.Client(); using var legal = await factory.Client(); using var board = await factory.Client();
        var ids = new[] { factory.StaffId, factory.AccountantId, factory.AdminId };
        store.Document = store.Document with { Steps = store.Document.Steps.Select((s, i) => s with { AssigneeId = ids[i] }).ToArray() };
        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<IdentityDbContext>();
            var roles = new[] { UserRole.SalesManager, UserRole.LegalStaff, UserRole.BoardMember };
            var departments = new[] { "KD", "PC", "BGD" };
            for (var i = 0; i < 3; i++)
            {
                var user = await db.Users.SingleAsync(u => u.UserId == ids[i]); user.Role = roles[i];
                user.DepartmentId = (await db.Departments.SingleAsync(d => d.Code == departments[i])).DepartmentId;
                db.Grants.Add(new() { Role = roles[i], PermissionCode = i == 1 ? "approvals.review-legal" : "approvals.approve" });
            }
            await db.SaveChangesAsync();
        }
        async Task Login(HttpClient c, string suffix)
        {
            var response = await c.PostAsJsonAsync("/api/v1/auth/login", new { identifier = factory.Prefix + "." + suffix, password = factory.Password });
            response.EnsureSuccessStatusCode(); var body = await response.Content.ReadFromJsonAsync<JsonElement>();
            c.DefaultRequestHeaders.Authorization = new("Bearer", body.GetProperty("accessToken").GetString());
        }
        await Login(sales, "staff"); await Login(legal, "accountant"); await Login(board, "admin");
        async Task<HttpResponseMessage> Act(HttpClient c, string step, string action)
        {
            c.DefaultRequestHeaders.Remove("Idempotency-Key"); c.DefaultRequestHeaders.Add("Idempotency-Key", Guid.NewGuid().ToString());
            var command = WorkflowEngineTests.Command(store.Document, step, action);
            object body = action is "accept" or "handoff" ? command.Expected : new DecisionRequest(command.Expected.RoundId, command.Expected.StepId, command.Expected.ViewedVersion, step, action, command.Comment!);
            return await c.PostAsJsonAsync($"/api/v1/approvals/contracts/{store.Document.Id}/{(action is "accept" or "handoff" ? action : "decisions")}", body);
        }
        Assert.Equal(HttpStatusCode.Conflict, (await Act(board, "board", "approve")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await Act(sales, "sales", "accept")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await Act(sales, "sales", "approve")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await Act(sales, "legal", "approve")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await Act(legal, "legal", "accept")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await Act(legal, "legal", "approve")).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await Act(board, "board", "approve")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await Act(board, "board", "accept")).StatusCode);
        var final = await Act(board, "board", "approve"); final.EnsureSuccessStatusCode();
        var result = await final.Content.ReadFromJsonAsync<ReviewOutcome>();
        Assert.Equal("approved", result!.Document.Status); Assert.Equal("completed", result.Document.RoundResult);
        Assert.Equal(6, store.Audit.Count);
        Assert.Equal(HttpStatusCode.Conflict, (await Act(board, "board", "approve")).StatusCode);
    }
}
