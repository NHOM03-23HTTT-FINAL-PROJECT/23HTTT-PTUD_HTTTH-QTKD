using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.Extensions.DependencyInjection;
using QTKD.Domain.Identity;
using QTKD.Infrastructure.Persistence;
using Xunit;

namespace QTKD.IntegrationTests;

// Real HTTP pipeline, JWT/session and authorization policies; the store is in-memory.
public sealed class WorkflowConfigApiTests : IDisposable
{
    private readonly MemoryWorkflowConfigStore store = new(WorkflowConfigServiceTests.Catalog());
    private readonly ApiFactory factory;
    public WorkflowConfigApiTests() => factory = new() { WorkflowConfigStore = store };
    public void Dispose() => factory.Dispose();

    private async Task<HttpClient> Login(string user, bool grant = true)
    {
        var client = await factory.Client();
        if (grant)
        {
            await using var scope = factory.Services.CreateAsyncScope();
            var db = scope.ServiceProvider.GetRequiredService<IdentityDbContext>();
            db.Grants.Add(new RolePermission { Role = UserRole.SystemAdmin, PermissionCode = "workflows.manage" });
            await db.SaveChangesAsync();
        }
        var login = await client.PostAsJsonAsync("/api/v1/auth/login", new { identifier = factory.Prefix + "." + user, password = factory.Password });
        login.EnsureSuccessStatusCode();
        var auth = await login.Content.ReadFromJsonAsync<JsonElement>();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", auth.GetProperty("accessToken").GetString());
        return client;
    }

    [Fact]
    public async Task Anonymous_is_401_and_user_without_workflows_manage_is_403()
    {
        var anonymous = await factory.Client();
        Assert.Equal(HttpStatusCode.Unauthorized, (await anonymous.GetAsync("/api/v1/workflow-configs")).StatusCode);
        var staff = await Login("staff", grant: false);
        Assert.Equal(HttpStatusCode.Forbidden, (await staff.GetAsync("/api/v1/workflow-configs")).StatusCode);
        var post = await staff.PostAsJsonAsync("/api/v1/workflow-configs", new { draft = WorkflowConfigServiceTests.Draft() });
        Assert.Equal(HttpStatusCode.Forbidden, post.StatusCode);
        Assert.Empty(store.Rows);
    }

    [Fact]
    public async Task Admin_lists_creates_reads_and_updates_configuration()
    {
        var admin = await Login("admin");
        var rows = await admin.GetFromJsonAsync<JsonElement>("/api/v1/workflow-configs");
        Assert.Equal(4, rows.GetArrayLength());
        var people = await admin.GetFromJsonAsync<JsonElement>("/api/v1/workflow-configs/participants");
        Assert.Equal(6, people.GetProperty("people").GetArrayLength());

        var create = new HttpRequestMessage(HttpMethod.Post, "/api/v1/workflow-configs") { Content = JsonContent.Create(new { draft = WorkflowConfigServiceTests.Draft() }) };
        create.Headers.Add("Idempotency-Key", "api-create-1");
        var created = await (await admin.SendAsync(create)).EnsureSuccessStatusCode().Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("QT-HD-KD", created.GetProperty("config").GetProperty("code").GetString());

        var update = new HttpRequestMessage(HttpMethod.Post, "/api/v1/workflow-configs/QT-HD-KD/versions")
        { Content = JsonContent.Create(new { baseVersion = 1, draft = WorkflowConfigServiceTests.Draft(name: "Đổi tên") }) };
        update.Headers.Add("Idempotency-Key", "api-update-1");
        var updated = await (await admin.SendAsync(update)).EnsureSuccessStatusCode().Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(2, updated.GetProperty("config").GetProperty("version").GetInt32());

        var read = await admin.GetFromJsonAsync<JsonElement>("/api/v1/workflow-configs/QT-HD-KD");
        Assert.Equal(2, read.GetProperty("history").GetArrayLength());
        Assert.Equal(HttpStatusCode.NotFound, (await admin.GetAsync("/api/v1/workflow-configs/QT-XX-KD")).StatusCode);
    }

    [Fact]
    public async Task Invalid_draft_returns_400_with_errors_per_stage()
    {
        var admin = await Login("admin");
        var draft = WorkflowConfigServiceTests.Draft() with
        { Stages = WorkflowConfigServiceTests.Draft().Stages.Select(s => s.Key == "sales" ? s with { Participants = [] } : s).ToArray() };
        var request = new HttpRequestMessage(HttpMethod.Post, "/api/v1/workflow-configs") { Content = JsonContent.Create(new { draft }) };
        request.Headers.Add("Idempotency-Key", "api-invalid-1");
        var response = await admin.SendAsync(request);
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("VALIDATION", body.GetProperty("code").GetString());
        Assert.True(body.GetProperty("errors").GetProperty("stages").TryGetProperty("sales", out _));
    }

    [Fact]
    public async Task Write_without_csrf_header_is_rejected()
    {
        var admin = await Login("admin");
        admin.DefaultRequestHeaders.Remove("X-QTKD-CSRF");
        var request = new HttpRequestMessage(HttpMethod.Post, "/api/v1/workflow-configs") { Content = JsonContent.Create(new { draft = WorkflowConfigServiceTests.Draft() }) };
        request.Headers.Add("Idempotency-Key", "api-csrf-1");
        var response = await admin.SendAsync(request);
        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        Assert.Equal("CSRF_REJECTED", (await response.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("code").GetString());
        Assert.Empty(store.Rows);
    }
}
