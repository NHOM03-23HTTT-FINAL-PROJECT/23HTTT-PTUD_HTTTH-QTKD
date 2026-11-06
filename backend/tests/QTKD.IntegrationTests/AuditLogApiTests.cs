using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using QTKD.Application.Common.Interfaces;
using QTKD.Application.Features.Audit;
using Xunit;

namespace QTKD.IntegrationTests;

// UC-CHUNG-06 API contract through the real pipeline (JWT, audit.view policy, controller, CSRF) with a spy repository.
public sealed class AuditLogApiTests : IDisposable
{
    private readonly AuditLogSpy store = new();
    private readonly ApiFactory factory;

    public AuditLogApiTests() => factory = new() { AuditLogRepository = store };
    public void Dispose() => factory.Dispose();

    private async Task<HttpClient> SignIn(string user)
    {
        var client = await factory.Client();
        var login = await client.PostAsJsonAsync("/api/v1/auth/login", new { identifier = factory.Prefix + "." + user, password = factory.Password });
        login.EnsureSuccessStatusCode();
        var auth = await login.Content.ReadFromJsonAsync<JsonElement>();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", auth.GetProperty("accessToken").GetString());
        return client;
    }

    private static async Task<JsonElement> Body(HttpResponseMessage response, HttpStatusCode status)
    {
        Assert.Equal(status, response.StatusCode);
        return await response.Content.ReadFromJsonAsync<JsonElement>();
    }

    [Fact]
    public async Task Anonymous_is_401_and_user_without_audit_view_is_403()
    {
        var anonymous = await factory.Client();
        Assert.Equal(HttpStatusCode.Unauthorized, (await anonymous.GetAsync("/api/v1/audit-logs")).StatusCode);

        var staff = await SignIn("staff");
        Assert.Equal(HttpStatusCode.Forbidden, (await staff.GetAsync("/api/v1/audit-logs")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await staff.GetAsync("/api/v1/audit-logs/options")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await staff.GetAsync($"/api/v1/audit-logs/{Guid.NewGuid()}")).StatusCode);
        Assert.Null(store.Searched);
    }

    [Fact]
    public async Task Admin_searches_newest_first_and_the_search_is_recorded()
    {
        var row = new AuditLogRecord(Guid.NewGuid(), DateTime.UtcNow, factory.AdminId, "Admin Test", "CONTRACT_SUBMITTED", "Contract",
            Guid.NewGuid(), "Draft", "Submitted", null, """{"title":"A"}""", null, "10.0.0.1");
        store.Items.Add(row);
        var admin = await SignIn("admin");

        var page = await Body(await admin.GetAsync("/api/v1/audit-logs?action=CONTRACT_SUBMITTED&pageSize=5"), HttpStatusCode.OK);

        Assert.Equal((1, 5), (page.GetProperty("total").GetInt32(), page.GetProperty("pageSize").GetInt32()));
        Assert.Equal(row.Id, page.GetProperty("items")[0].GetProperty("id").GetGuid());
        Assert.Equal("CONTRACT_SUBMITTED", store.Searched!.Action);
        Assert.Equal((AuditActions.Search, factory.AdminId), (store.Appended.Single().Action, store.Appended.Single().ActorId));

        var detail = await Body(await admin.GetAsync($"/api/v1/audit-logs/{row.Id}"), HttpStatusCode.OK);
        Assert.Equal(["status", "title"], detail.GetProperty("changes").EnumerateArray().Select(c => c.GetProperty("field").GetString()));
        Assert.Equal("NOT_FOUND", (await Body(await admin.GetAsync($"/api/v1/audit-logs/{Guid.NewGuid()}"), HttpStatusCode.NotFound)).GetProperty("code").GetString());
    }

    [Fact]
    public async Task Invalid_filter_names_the_field_and_queries_nothing()
    {
        var admin = await SignIn("admin");
        var error = await Body(await admin.GetAsync("/api/v1/audit-logs?from=2026-11-05&to=2026-11-01"), HttpStatusCode.BadRequest);
        Assert.Equal(("VALIDATION", "to", "RANGE_INVERTED"),
            (error.GetProperty("code").GetString(), error.GetProperty("field").GetString(), error.GetProperty("reason").GetString()));
        Assert.Null(store.Searched);
    }

    [Fact]
    public async Task Change_attempts_are_refused_and_recorded_for_any_signed_in_user()
    {
        var staff = await SignIn("staff");
        var id = Guid.NewGuid();

        var delete = await Body(await staff.DeleteAsync($"/api/v1/audit-logs/{id}"), HttpStatusCode.MethodNotAllowed);
        Assert.Equal("AUDIT_IMMUTABLE", delete.GetProperty("code").GetString());
        await Body(await staff.PostAsJsonAsync("/api/v1/audit-logs", new { }), HttpStatusCode.MethodNotAllowed);

        Assert.Equal([(AuditActions.MutationRejected, (Guid?)id), (AuditActions.MutationRejected, (Guid?)null)],
            store.Appended.Select(e => (e.Action, e.EntityId)));

        staff.DefaultRequestHeaders.Remove("X-QTKD-CSRF");
        Assert.Equal("CSRF_REJECTED", (await Body(await staff.DeleteAsync($"/api/v1/audit-logs/{id}"), HttpStatusCode.Forbidden)).GetProperty("code").GetString());
        Assert.Equal(2, store.Appended.Count);
    }

    private sealed class AuditLogSpy : IAuditLogRepository
    {
        public List<AuditLogRecord> Items { get; } = [];
        public AuditQuery? Searched { get; private set; }
        public List<AuditEntry> Appended { get; } = [];

        public Task<(IReadOnlyList<AuditLogRecord> Items, int Total)> SearchAsync(AuditQuery query, CancellationToken ct)
        {
            Searched = query;
            return Task.FromResult<(IReadOnlyList<AuditLogRecord>, int)>((Items, Items.Count));
        }

        public Task<AuditLogRecord?> FindAsync(Guid id, CancellationToken ct) => Task.FromResult(Items.SingleOrDefault(i => i.Id == id));

        public Task<AuditFilterOptions> OptionsAsync(CancellationToken ct) => Task.FromResult(new AuditFilterOptions([], [], []));

        public Task AppendAsync(AuditEntry entry, CancellationToken ct)
        {
            Appended.Add(entry);
            return Task.CompletedTask;
        }
    }
}
