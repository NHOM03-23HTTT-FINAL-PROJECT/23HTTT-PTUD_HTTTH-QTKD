using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.Extensions.DependencyInjection;
using QTKD.Application.Features.ContractApprovals;
using QTKD.Infrastructure.ContractApprovals;
using Xunit;

namespace QTKD.IntegrationTests;

// Real HTTP pipeline, JWT/session and CSRF. The notification store is a spy only:
// these tests verify the inbox contract (recipient scoping, read-state writes), NOT PostgreSQL.
public sealed class NotificationApiTests : IDisposable
{
    private readonly NotificationSpy store;
    private readonly ApiFactory factory;
    public NotificationApiTests()
    {
        store = new NotificationSpy();
        factory = new() { NotificationStore = store };
    }
    public void Dispose() => factory.Dispose();
    private async Task<HttpClient> Setup()
    {
        var client = await factory.Client();
        var login = await client.PostAsJsonAsync("/api/v1/auth/login", new { identifier = factory.Prefix + ".staff", password = factory.Password });
        login.EnsureSuccessStatusCode();
        var auth = await login.Content.ReadFromJsonAsync<JsonElement>();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", auth.GetProperty("accessToken").GetString());
        return client;
    }
    private static async Task AssertError(HttpResponseMessage response, int status, string code)
    {
        Assert.Equal(status, (int)response.StatusCode);
        Assert.Equal(code, (await response.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("code").GetString());
    }
    private static NotificationItem Item(string content, bool read, string kind = NotificationKinds.ReviewRequired) =>
        new(Guid.NewGuid(), kind, "Contract", Guid.NewGuid(), "HĐ Demo", content, read, DateTime.UtcNow);
    [Fact]
    public async Task List_and_unread_count_are_scoped_to_the_signed_in_user()
    {
        using var client = await Setup();
        store.Items = [Item("Hợp đồng chờ duyệt", false)];
        var page = await client.GetFromJsonAsync<NotificationPage>("/api/v1/notifications");
        Assert.Equal(factory.StaffId, Assert.Single(store.Listed).Actor);
        Assert.Equal("Hợp đồng chờ duyệt", Assert.Single(page!.Items).Content);
        Assert.Equal((1, 1, 1, NotificationQuery.DefaultPageSize), (page.Total, page.UnreadCount, page.Page, page.PageSize));
        // Wire contract for FE: page envelope and the fields needed to label and open the record (bước 3, 7).
        using var raw = JsonDocument.Parse(await (await client.GetAsync("/api/v1/notifications")).Content.ReadAsStringAsync());
        Assert.Equal(["items", "total", "unreadCount", "page", "pageSize"], raw.RootElement.EnumerateObject().Select(p => p.Name).ToArray());
        Assert.Equal(["id", "kind", "recordType", "recordId", "recordTitle", "content", "isRead", "createdAt"],
            raw.RootElement.GetProperty("items").EnumerateArray().Single().EnumerateObject().Select(p => p.Name).ToArray());
        var count = await client.GetFromJsonAsync<JsonElement>("/api/v1/notifications/unread-count");
        Assert.Equal(1, count.GetProperty("count").GetInt32());
        Assert.Equal(factory.StaffId, store.CountActor);
    }
    [Fact]
    public async Task Filter_and_paging_are_passed_to_the_store()
    {
        using var client = await Setup();
        (await client.GetAsync("/api/v1/notifications?filter=unread&page=3&pageSize=5")).EnsureSuccessStatusCode();
        (await client.GetAsync("/api/v1/notifications?filter=all")).EnsureSuccessStatusCode();
        Assert.Equal([new NotificationQuery(true, 3, 5), new NotificationQuery(false, 1, NotificationQuery.DefaultPageSize)],
            store.Listed.Select(x => x.Query).ToArray());
    }
    [Theory]
    [InlineData("filter=read")]
    [InlineData("page=0")]
    [InlineData("pageSize=0")]
    [InlineData("pageSize=101")]
    public async Task Invalid_filter_or_paging_is_rejected(string query)
    {
        using var client = await Setup();
        await AssertError(await client.GetAsync("/api/v1/notifications?" + query), 400, "VALIDATION");
        Assert.Empty(store.Listed);
    }
    [Fact]
    public async Task Mark_one_and_mark_all_are_writes_to_the_caller_only()
    {
        using var client = await Setup();
        store.Items = [Item("Chưa đọc 1", false), Item("Chưa đọc 2", false), Item("Đã đọc", true)];
        var id = Guid.NewGuid();
        var item = await client.PostAsJsonAsync($"/api/v1/notifications/{id}/read", new { });
        item.EnsureSuccessStatusCode();
        Assert.Equal((factory.StaffId, id), store.Read);
        Assert.Equal(id, (await item.Content.ReadFromJsonAsync<NotificationItem>())!.Id);
        var all = await client.PostAsJsonAsync("/api/v1/notifications/read-all", new { });
        all.EnsureSuccessStatusCode();
        Assert.Equal(factory.StaffId, store.AllReadActor);
        Assert.Equal(2, (await all.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("updated").GetInt32());
    }
    [Fact]
    public async Task Missing_or_foreign_notification_is_reported_as_not_found()
    {
        using var client = await Setup();
        store.Failure = new ReviewFailure(404, "NOT_FOUND");
        await AssertError(await client.PostAsJsonAsync($"/api/v1/notifications/{Guid.NewGuid()}/read", new { }), 404, "NOT_FOUND");
    }
    [Fact]
    public async Task Writes_need_csrf_and_a_session_reads_need_a_token()
    {
        using var client = await Setup();
        client.DefaultRequestHeaders.Remove("X-QTKD-CSRF");
        await AssertError(await client.PostAsJsonAsync("/api/v1/notifications/read-all", new { }), 403, "CSRF_REJECTED");
        await AssertError(await client.PostAsJsonAsync($"/api/v1/notifications/{Guid.NewGuid()}/read", new { }), 403, "CSRF_REJECTED");
        Assert.Null(store.AllReadActor);
        client.DefaultRequestHeaders.Authorization = null;
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/v1/notifications")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/v1/notifications/unread-count")).StatusCode);
        Assert.Empty(store.Listed);
    }
    [Fact]
    public void Production_resolves_the_postgres_notification_store()
    {
        using var production = new ApiFactory();
        using var scope = production.Services.CreateScope();
        Assert.IsType<PostgresApprovalStore>(scope.ServiceProvider.GetRequiredService<INotificationStore>());
    }
    private sealed class NotificationSpy : INotificationStore
    {
        public IReadOnlyList<NotificationItem> Items = [];
        public List<(Guid Actor, NotificationQuery Query)> Listed = [];
        public Guid? CountActor;
        public (Guid Actor, Guid Id)? Read;
        public Guid? AllReadActor;
        public ReviewFailure? Failure;
        private void MaybeFail()
        {
            if (Failure is not null) throw Failure;
        }
        public Task<NotificationPage> Notifications(Guid actor, NotificationQuery query, CancellationToken ct)
        {
            Listed.Add((actor, query)); MaybeFail();
            return Task.FromResult(new NotificationPage(Items, Items.Count, Items.Count(x => !x.IsRead), query.Page, query.PageSize));
        }
        public Task<int> UnreadCount(Guid actor, CancellationToken ct)
        { CountActor = actor; MaybeFail(); return Task.FromResult(Items.Count(x => !x.IsRead)); }
        public Task<NotificationItem> MarkRead(Guid actor, Guid id, CancellationToken ct)
        {
            Read = (actor, id); MaybeFail();
            var item = Items.FirstOrDefault(x => x.Id == id) ?? Item("Thông báo", false) with { Id = id };
            return Task.FromResult(item with { IsRead = true });
        }
        public Task<int> MarkAllRead(Guid actor, CancellationToken ct)
        { AllReadActor = actor; MaybeFail(); return Task.FromResult(Items.Count(x => !x.IsRead)); }
    }
}
