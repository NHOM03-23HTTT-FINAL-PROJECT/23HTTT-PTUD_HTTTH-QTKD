using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Npgsql;
using QTKD.Application.Features.Customers;
using QTKD.Application.Common.Interfaces;
using QTKD.Infrastructure.Customers;
using QTKD.Infrastructure.Persistence;
using Customer = QTKD.Infrastructure.Persistence.Schema.Customer;
using CustomerStatus = QTKD.Infrastructure.Persistence.Schema.ActiveStatus;
using AreaStatus = QTKD.Domain.Enums.ActiveStatus;
using Xunit;

namespace QTKD.IntegrationTests;

public sealed class LocalCustomerPostgresFactAttribute : FactAttribute
{
    public LocalCustomerPostgresFactAttribute()
    {
        if (Environment.GetEnvironmentVariable("QTKD_CUSTOMER_TEST_DISPOSABLE") != "true")
            Skip = "Requires the explicitly disposable loopback customer database migrated by QTKD.DbTool.";
    }
}

public sealed class CustomerReactivationPostgresTests
{
    private sealed class ControlledSource : ICustomerStatusSource
    {
        public bool Complete { get; set; }
        public bool Allowed { get; set; }
        public bool Missing { get; set; }
        public string? Basis { get; set; } = "Xác nhận Kế toán thử nghiệm";
        public string CheckStatus { get; set; } = "met";
        public TaskCompletionSource<bool>? Started { get; set; }
        public TaskCompletionSource<bool>? Continue { get; set; }
        public bool SuspensionComplete { get; set; }
        public SuspensionImpact[] SuspensionItems { get; set; } = [];
        public string Revision { get; set; } = "review-1";
        public string[] Notifications { get; set; } = ["Kế toán"];
        public TaskCompletionSource<bool>? SuspensionStarted { get; set; }
        public TaskCompletionSource<bool>? SuspensionContinue { get; set; }
        public async Task<SuspensionSourceResult> Suspension(Guid customerId, Guid actorId, bool forConfirmation, CancellationToken ct)
        {
            if (forConfirmation)
            {
                SuspensionStarted?.TrySetResult(true);
                if (SuspensionContinue is { } continuation) await continuation.Task.WaitAsync(ct);
            }
            return new(SuspensionComplete, SuspensionItems, SuspensionComplete ? [] : ["job"],
                SuspensionComplete ? [] : ["operations_jobs"], Revision, Notifications);
        }

        public async Task<ReactivationSourceResult> Reactivation(Guid customerId,
            Guid actorId, string? reasonGroup, StatusException? exception, CancellationToken ct)
        {
            Started?.TrySetResult(true);
            if (Continue is { } continuation) await continuation.Task.WaitAsync(ct);
            return new(Complete, Allowed, Missing ? ["debt"] : [],
                [new("debt", "Công nợ", CheckStatus, "Nguồn kiểm thử có kiểm soát")], Basis);
        }
    }

    private sealed class CustomerFactory(string connection, ControlledSource source, bool productionSource = false) : WebApplicationFactory<Program>
    {
        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            builder.UseEnvironment("Testing");
            builder.ConfigureAppConfiguration((_, config) => config.AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["ConnectionStrings:Identity"] = connection,
                ["Jwt:SigningKey"] = "isolated-customer-test-signing-key-at-least-32-bytes",
                ["Jwt:Issuer"] = "qtkd-api", ["Jwt:Audience"] = "qtkd-web"
            }));
            builder.ConfigureTestServices(services =>
            {
                if (productionSource) return;
                services.RemoveAll<ICustomerStatusSource>();
                services.AddSingleton<ICustomerStatusSource>(source);
            });
        }
    }

    private sealed class Fixture(NpgsqlConnection db, CustomerFactory factory, Dictionary<string, Guid> users,
        Dictionary<string, string> names, ControlledSource source) : IAsyncDisposable
    {
        public NpgsqlConnection Db => db;
        private Guid? previousManager;
        private bool restoreManager;
        public async Task AssignSalesManager()
        {
            await using var read = new NpgsqlCommand("SELECT manager_id FROM qtkd.department WHERE code='KD'", db);
            var value = await read.ExecuteScalarAsync(); previousManager = value is Guid id ? id : null;
            await Execute("UPDATE qtkd.department SET manager_id=@id WHERE code='KD'", ("id", users["manager"]));
            restoreManager = true;
        }
        public ControlledSource Source => source;
        public Dictionary<string, Guid> Users => users;
        public static async Task<Fixture> Create(bool productionSource = false)
        {
            var port = int.Parse(Environment.GetEnvironmentVariable("QTKD_CUSTOMER_TEST_PORT") ?? "0");
            if (port is < 1024 or > 65535) throw new InvalidOperationException("Explicit loopback test port required.");
            var connection = $"Host=127.0.0.1;Port={port};Database=qtkdtest;Username=postgres;Password=qtkd-test-only;SSL Mode=Disable";
            var db = new NpgsqlConnection(connection); await db.OpenAsync();
            var prefix = "reactivate." + Guid.NewGuid().ToString("N")[..10];
            var users = new Dictionary<string, Guid>(); var names = new Dictionary<string, string>();
            foreach (var (name, role, department) in new[] { ("manager", "SalesManager", "KD"), ("staff", "SalesStaff", "KD"),
                ("other", "SalesStaff", "KD"), ("outside", "OperationsStaff", "KT") })
            {
                names[name] = prefix + "." + name;
                await using var cmd = new NpgsqlCommand("""
                    INSERT INTO qtkd.user_account(username,company_email,password_hash,full_name,department_id,role,status,must_change_password)
                    SELECT @name,@email,@hash,@name,department_id,@role::qtkd.user_role,'Active',false
                    FROM qtkd.department WHERE code=@department RETURNING user_id
                    """, db);
                cmd.Parameters.AddWithValue("name", names[name]); cmd.Parameters.AddWithValue("email", names[name] + "@example.invalid");
                cmd.Parameters.AddWithValue("hash", BCrypt.Net.BCrypt.HashPassword("Customer.Test@2026", 10));
                cmd.Parameters.AddWithValue("role", role); cmd.Parameters.AddWithValue("department", department);
                users[name] = (Guid)(await cmd.ExecuteScalarAsync())!;
            }
            var source = new ControlledSource(); return new(db, new(connection, source, productionSource), users, names, source);
        }

        public async Task<HttpClient> Client(string name)
        {
            var client = factory.CreateClient();
            client.DefaultRequestHeaders.Add("Origin", "http://localhost:5173");
            client.DefaultRequestHeaders.Add("X-QTKD-CSRF", "1");
            var response = await client.PostAsJsonAsync("/api/v1/auth/login", new { identifier = names[name], password = "Customer.Test@2026" });
            response.EnsureSuccessStatusCode();
            var body = await response.Content.ReadFromJsonAsync<JsonElement>();
            client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", body.GetProperty("accessToken").GetString());
            return client;
        }

        // Legacy suspension history is a fixture, separate from testing the status API.
        public async Task<string> Customer(string owner = "staff", bool suspended = true, bool decision = true)
        {
            await using var cmd = new NpgsqlCommand("""
                INSERT INTO qtkd.customer(customer_name,tax_code,address,legal_representative,phone,account_manager_id,status)
                VALUES ('Khách kiểm thử',@tax,'Địa chỉ thử','Người thử','0900000000',@owner,@status::qtkd.active_status)
                RETURNING customer_code
                """, db);
            cmd.Parameters.AddWithValue("tax", "6" + Random.Shared.Next(1_000_000_000).ToString("D9"));
            cmd.Parameters.AddWithValue("owner", users[owner]); cmd.Parameters.AddWithValue("status", suspended ? "Suspended" : "Active");
            var code = (string)(await cmd.ExecuteScalarAsync())!;
            if (suspended && decision)
                await Execute("""
                    INSERT INTO qtkd.customer_status_decision(customer_id,decision_type,reason,confirmed_by,review_metadata)
                    SELECT customer_id,'Suspend','Công nợ cũ',@actor,'{"reasonGroup":"CONG_NO","plan":[]}'::jsonb
                    FROM qtkd.customer WHERE customer_code=@code
                    """, ("actor", users["manager"]), ("code", code));
            return code;
        }
        public async Task Execute(string sql, params (string Name, object Value)[] args)
        {
            await using var cmd = new NpgsqlCommand(sql, db);
            foreach (var (name, value) in args) cmd.Parameters.AddWithValue(name, value);
            await cmd.ExecuteNonQueryAsync();
        }
        public async Task<long> Count(string sql, Guid id)
        {
            await using var cmd = new NpgsqlCommand(sql, db); cmd.Parameters.AddWithValue("id", id);
            return Convert.ToInt64(await cmd.ExecuteScalarAsync());
        }
        public async ValueTask DisposeAsync()
        {
            factory.Dispose();
            if (restoreManager)
            {
                await using var restore = new NpgsqlCommand("UPDATE qtkd.department SET manager_id=@id WHERE code='KD'", db);
                restore.Parameters.Add("id", NpgsqlTypes.NpgsqlDbType.Uuid).Value = (object?)previousManager ?? DBNull.Value;
                await restore.ExecuteNonQueryAsync();
            }
            await db.DisposeAsync();
        }
    }

    private static async Task<HttpResponseMessage> Post(HttpClient client, string path, object body, string? key = null)
    {
        using var request = new HttpRequestMessage(HttpMethod.Post, path) { Content = JsonContent.Create(body) };
        if (key is not null) request.Headers.Add("Idempotency-Key", key);
        return await client.SendAsync(request);
    }
    private static async Task<string?> Error(HttpResponseMessage response) =>
        (await response.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("code").GetString();
    private static object Reactivate(int version = 1, string reason = "Tiếp tục hợp tác") =>
        new { baseVersion = version, reason, evidence = Array.Empty<object>() };

    [LocalCustomerPostgresFact]
    public async Task Customer_and_area_statuses_round_trip_through_the_same_postgres_enum()
    {
        await using var fixture = await Fixture.Create();
        var code = await fixture.Customer(suspended: false);
        var connection = new NpgsqlConnectionStringBuilder(fixture.Db.ConnectionString)
        {
            Password = "qtkd-test-only"
        };
        await using var db = new QtkdDbContext(QtkdPersistence.Options(connection.ConnectionString));
        await using var transaction = await db.Database.BeginTransactionAsync();
        var areaId = await db.Areas.Where(area => area.Level == 3).Select(area => area.AreaId).FirstAsync();

        foreach (var suspended in new[] { true, false })
        {
            var customerStatus = suspended ? CustomerStatus.Suspended : CustomerStatus.Active;
            var areaStatus = suspended ? AreaStatus.Suspended : AreaStatus.Active;
            var customer = await db.Set<Customer>().SingleAsync(item => item.CustomerCode == code);
            var area = await db.Areas.SingleAsync(item => item.AreaId == areaId);
            customer.Status = customerStatus;
            area.Status = areaStatus;
            await db.SaveChangesAsync();
            db.ChangeTracker.Clear();

            Assert.Equal(customerStatus, (await db.Set<Customer>().SingleAsync(item =>
                item.CustomerCode == code && item.Status == customerStatus)).Status);
            Assert.Equal(areaStatus, (await db.Areas.SingleAsync(item =>
                item.AreaId == areaId && item.Status == areaStatus)).Status);
            db.ChangeTracker.Clear();
        }

        await transaction.RollbackAsync();
    }

    [LocalCustomerPostgresFact]
    public async Task Duplicate_tax_returns_reference_only_inside_scope_and_does_not_write_history()
    {
        await using var f = await Fixture.Create();
        using var staff = await f.Client("staff");
        foreach (var (owner, suspended) in new[] { ("staff", false), ("other", false), ("staff", true), ("outside", false) })
        {
            var code = await f.Customer(owner, suspended);
            string tax; Guid id;
            await using (var lookup = new NpgsqlCommand("SELECT tax_code,customer_id FROM qtkd.customer WHERE customer_code=@code", f.Db))
            {
                lookup.Parameters.AddWithValue("code", code);
                await using var reader = await lookup.ExecuteReaderAsync();
                Assert.True(await reader.ReadAsync());
                tax = reader.GetString(0); id = reader.GetGuid(1);
            }
            var response = await Post(staff, "/api/v1/customers", new { draft = new
            {
                name = "Hồ sơ không được tạo trùng", taxCode = tax, address = "Địa chỉ thử",
                representative = "Người thử", phone = "0900000000", serviceGroups = Array.Empty<string>()
            } }, Guid.NewGuid().ToString());
            Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
            var body = await response.Content.ReadFromJsonAsync<JsonElement>();
            Assert.Equal("DUPLICATE_TAX_CODE", body.GetProperty("code").GetString());
            var existing = body.GetProperty("detail").GetProperty("existing");
            if (owner == "outside")
                Assert.Equal(JsonValueKind.Null, existing.ValueKind);
            else
            {
                Assert.Equal(code, existing.GetProperty("code").GetString());
                Assert.Equal(tax, existing.GetProperty("taxCode").GetString());
                Assert.Equal("Khách kiểm thử", existing.GetProperty("name").GetString());
                Assert.Equal(suspended ? "suspended" : "active", existing.GetProperty("status").GetString());
            }
            Assert.Equal(1, await f.Count("SELECT count(*) FROM qtkd.customer WHERE customer_id=@id", id));
            Assert.Equal(0, await f.Count("SELECT count(*) FROM qtkd.customer_operation WHERE customer_id=@id", id));
            Assert.Equal(0, await f.Count("SELECT count(*) FROM qtkd.audit_log WHERE entity_id=@id", id));
        }
    }

    [LocalCustomerPostgresFact]
    public async Task Suspension_requires_current_permission_reason_version_csrf_and_complete_review()
    {
        await using var f = await Fixture.Create(); using var manager = await f.Client("manager"); using var staff = await f.Client("staff");
        var code = await f.Customer(suspended: false); var path = "/api/v1/customers/" + code;
        Assert.Equal(HttpStatusCode.Forbidden, (await staff.GetAsync(path + "/suspension-review")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await Post(staff, path + "/suspend", Suspend("any"), Guid.NewGuid().ToString())).StatusCode);
        manager.DefaultRequestHeaders.Remove("X-QTKD-CSRF");
        Assert.Equal("CSRF_REJECTED", await Error(await Post(manager, path + "/suspend", Suspend("any"), Guid.NewGuid().ToString())));
        manager.DefaultRequestHeaders.Add("X-QTKD-CSRF", "1");
        Assert.Equal("IDEMPOTENCY_KEY_REQUIRED", await Error(await Post(manager, path + "/suspend", Suspend("any"))));
        Assert.Equal("VALIDATION", await Error(await Post(manager, path + "/suspend", Suspend("any", reason: " "), Guid.NewGuid().ToString())));
        Assert.Equal("VALIDATION", await Error(await Post(manager, path + "/suspend", Suspend("any") with { ReasonGroup = "FAKE" }, Guid.NewGuid().ToString())));
        Assert.Equal("EVIDENCE_UNAVAILABLE", await Error(await Post(manager, path + "/suspend",
            Suspend("any") with { Evidence = [new("untrusted.pdf", 100)] }, Guid.NewGuid().ToString())));
        Assert.Equal("IMMUTABLE_FIELD", await Error(await Post(manager, path + "/suspend", new { actorId = f.Users["manager"] }, Guid.NewGuid().ToString())));
        Assert.Equal("VALIDATION", await Error(await Post(manager, path + "/suspend", Suspend("any") with { Plan = [null!] }, Guid.NewGuid().ToString())));
        Assert.Equal("CONFLICT", await Error(await Post(manager, path + "/suspend", Suspend("any", version: 9), Guid.NewGuid().ToString())));
        var review = await manager.GetFromJsonAsync<JsonElement>(path + "/suspension-review");
        Assert.Contains(review.GetProperty("failedKinds").EnumerateArray(), x => x.GetString() == "job");
        Assert.Equal("REVIEW_INCOMPLETE", await Error(await Post(manager, path + "/suspend",
            Suspend(review.GetProperty("reviewToken").GetString()!), Guid.NewGuid().ToString())));
        var view = await manager.GetFromJsonAsync<JsonElement>(path);
        Assert.Equal("active", view.GetProperty("status").GetString()); Assert.Equal(1, view.GetProperty("version").GetInt32());
        Assert.Empty(view.GetProperty("statusDecisions").EnumerateArray());
    }

    private static SuspendCustomerRequest Suspend(string token, int version = 1, string reason = "Tạm ngưng hợp tác", StatusPlanItem[]? plan = null, string? note = null) =>
        new(version, "KHAC", reason, [], plan ?? [], note, token);
    private static async Task<string> ReviewToken(HttpClient client, string path) =>
        (await client.GetFromJsonAsync<JsonElement>(path + "/suspension-review")).GetProperty("reviewToken").GetString()!;

    [LocalCustomerPostgresFact]
    public async Task Suspension_is_atomic_idempotent_concurrent_and_enqueues_only_configured_notifications()
    {
        await using var f = await Fixture.Create(); using var manager = await f.Client("manager");
        f.Source.SuspensionComplete = true;
        var code = await f.Customer(suspended: false); var path = "/api/v1/customers/" + code;
        var request = Suspend(await ReviewToken(manager, path));
        await f.Execute("ALTER TABLE qtkd.customer_status_outbox ADD CONSTRAINT customer_test_reject CHECK (payload->>'reason' <> 'simulate suspend failure')");
        try
        {
            Assert.Equal(HttpStatusCode.Conflict, (await Post(manager, path + "/suspend", request with { Reason = "simulate suspend failure" }, Guid.NewGuid().ToString())).StatusCode);
            var unchanged = await manager.GetFromJsonAsync<JsonElement>(path);
            Assert.Equal("active", unchanged.GetProperty("status").GetString()); Assert.Equal(1, unchanged.GetProperty("version").GetInt32());
            Assert.Empty(unchanged.GetProperty("statusDecisions").EnumerateArray());
            Assert.Equal(0, await f.Count("SELECT count(*) FROM qtkd.audit_log WHERE actor_id=@id AND action='CUSTOMER_SUSPENDED'", f.Users["manager"]));
            Assert.Equal(0, await f.Count("SELECT count(*) FROM qtkd.customer_operation WHERE actor_id=@id AND operation='suspend'", f.Users["manager"]));
        }
        finally { await f.Execute("ALTER TABLE qtkd.customer_status_outbox DROP CONSTRAINT customer_test_reject"); }
        var keys = new[] { Guid.NewGuid().ToString(), Guid.NewGuid().ToString() };
        var responses = await Task.WhenAll(keys.Select(key => Post(manager, path + "/suspend", request, key)));
        Assert.Equal(new[] { HttpStatusCode.OK, HttpStatusCode.Conflict }, responses.Select(r => r.StatusCode).Order().ToArray());
        var winner = Array.FindIndex(responses, r => r.StatusCode == HttpStatusCode.OK);
        var result = await responses[winner].Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("suspended", result.GetProperty("customer").GetProperty("status").GetString());
        Assert.Equal(2, result.GetProperty("customer").GetProperty("version").GetInt32());
        Assert.True((await (await Post(manager, path + "/suspend", request, keys[winner])).Content.ReadFromJsonAsync<JsonElement>()).GetProperty("replayed").GetBoolean());
        Assert.Equal("IDEMPOTENCY_KEY_REUSED", await Error(await Post(manager, path + "/suspend", request with { Reason = "Other" }, keys[winner])));
        Assert.Equal("ALREADY_IN_STATUS", await Error(await Post(manager, path + "/suspend", request, Guid.NewGuid().ToString())));
        Assert.Single(result.GetProperty("customer").GetProperty("statusDecisions").EnumerateArray());
        Assert.Equal(1, await f.Count("SELECT count(*) FROM qtkd.customer_status_outbox o JOIN qtkd.customer_status_decision d USING(decision_id) WHERE d.confirmed_by=@id", f.Users["manager"]));
        Assert.Equal(1, await f.Count("SELECT count(*) FROM qtkd.audit_log WHERE actor_id=@id AND action='CUSTOMER_SUSPENDED'", f.Users["manager"]));
        Assert.Equal(1, await f.Count("SELECT count(*) FROM qtkd.customer_operation WHERE actor_id=@id AND operation='suspend'", f.Users["manager"]));
        // No notification configuration is a valid completion, with no extra outbox row.
        f.Source.Notifications = [];
        var noNoticePath = "/api/v1/customers/" + await f.Customer(suspended: false);
        Assert.Equal(HttpStatusCode.OK, (await Post(manager, noNoticePath + "/suspend", Suspend(await ReviewToken(manager, noNoticePath)), Guid.NewGuid().ToString())).StatusCode);
        Assert.Equal(1, await f.Count("SELECT count(*) FROM qtkd.customer_status_outbox o JOIN qtkd.customer_status_decision d USING(decision_id) WHERE d.confirmed_by=@id", f.Users["manager"]));
    }

    [LocalCustomerPostgresFact]
    public async Task Suspension_rechecks_impact_snapshot_and_requires_each_plan_and_coordination_basis()
    {
        await using var f = await Fixture.Create(); using var manager = await f.Client("manager");
        f.Source.SuspensionComplete = true;
        f.Source.SuspensionItems = [new("contract:fixture", "contract", "Còn hiệu lực", "HD-TEST", "Hợp đồng thử", "Không hủy",
            "Active", "info", "Pháp chế", ["Giữ nguyên"], "Hợp đồng giữ Active")];
        var path = "/api/v1/customers/" + await f.Customer(suspended: false);
        var token = await ReviewToken(manager, path);
        f.Source.Revision = "changed-after-review";
        Assert.Equal("REVIEW_CHANGED", await Error(await Post(manager, path + "/suspend", Suspend(token), Guid.NewGuid().ToString())));
        token = await ReviewToken(manager, path);
        foreach (var plan in new[] { Array.Empty<StatusPlanItem>(), new[] { new StatusPlanItem("fake", "Giữ nguyên") },
            new[] { new StatusPlanItem("contract:fixture", "Tự hủy") }, new[] { new StatusPlanItem("contract:fixture", "Giữ nguyên"), new StatusPlanItem("contract:fixture", "Giữ nguyên") } })
            Assert.Equal("PLAN_INCOMPLETE", await Error(await Post(manager, path + "/suspend", Suspend(token, plan: plan, note: "Căn cứ thử"), Guid.NewGuid().ToString())));
        var request = Suspend(token, plan: [new("contract:fixture", "Giữ nguyên")]);
        Assert.Equal("PLAN_INCOMPLETE", await Error(await Post(manager, path + "/suspend", request, Guid.NewGuid().ToString())));
        Assert.Equal(HttpStatusCode.OK, (await Post(manager, path + "/suspend", request with { CoordinationNote = "Pháp chế thống nhất theo văn bản thử" }, Guid.NewGuid().ToString())).StatusCode);
        var context = await manager.GetFromJsonAsync<JsonElement>(path + "/reactivation-context");
        var saved = Assert.Single(context.GetProperty("suspension").GetProperty("plan").EnumerateArray());
        Assert.Equal("contract", saved.GetProperty("kind").GetString()); Assert.Equal("Giữ nguyên", saved.GetProperty("option").GetString());
    }

    [LocalCustomerPostgresFact]
    public async Task Suspension_delegation_is_action_specific_owner_scoped_and_rechecked_after_slow_review()
    {
        await using var f = await Fixture.Create(); using var manager = await f.Client("manager"); using var staff = await f.Client("staff");
        f.Source.SuspensionComplete = true;
        var path = "/api/v1/customers/" + await f.Customer(suspended: false);
        var peerPath = "/api/v1/customers/" + await f.Customer("other", suspended: false);
        var body = new { granteeId = f.Users["staff"], action = "suspend", expiresAt = DateTimeOffset.UtcNow.AddHours(1) };
        var grantResponse = await manager.PostAsJsonAsync("/api/v1/customers/delegations", body);
        Assert.Equal(HttpStatusCode.OK, grantResponse.StatusCode);
        var grant = await grantResponse.Content.ReadFromJsonAsync<JsonElement>();
        var id = grant.GetProperty("id").GetGuid(); Assert.Equal("suspend", grant.GetProperty("action").GetString());
        Assert.Equal("DELEGATION_EXISTS", await Error(await manager.PostAsJsonAsync("/api/v1/customers/delegations", body)));
        var permissions = await staff.GetFromJsonAsync<JsonElement>(path + "/status-permissions");
        Assert.True(permissions.GetProperty("canSuspend").GetBoolean()); Assert.False(permissions.GetProperty("canReactivate").GetBoolean());
        Assert.Equal(HttpStatusCode.Forbidden, (await staff.GetAsync(peerPath + "/suspension-review")).StatusCode);
        var request = Suspend(await ReviewToken(staff, path));
        f.Source.SuspensionStarted = new(TaskCreationOptions.RunContinuationsAsynchronously);
        f.Source.SuspensionContinue = new(TaskCreationOptions.RunContinuationsAsynchronously);
        var pending = Post(staff, path + "/suspend", request, Guid.NewGuid().ToString());
        await f.Source.SuspensionStarted.Task.WaitAsync(TimeSpan.FromSeconds(15));
        await f.Execute("UPDATE qtkd.customer_status_delegation SET granted_at=clock_timestamp()-interval '2 minutes',expires_at=clock_timestamp()-interval '1 minute' WHERE delegation_id=@id", ("id", id));
        f.Source.SuspensionContinue.SetResult(true);
        Assert.Equal(HttpStatusCode.Forbidden, (await pending).StatusCode);
        var unchanged = await manager.GetFromJsonAsync<JsonElement>(path); Assert.Equal("active", unchanged.GetProperty("status").GetString());
        Assert.Equal(HttpStatusCode.OK, (await manager.PostAsJsonAsync("/api/v1/customers/delegations/" + id + "/revoke", new { })).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await manager.PostAsJsonAsync("/api/v1/customers/delegations", new { granteeId = f.Users["staff"], action = "suspend" })).StatusCode);
        var key = Guid.NewGuid().ToString();
        Assert.Equal(HttpStatusCode.OK, (await Post(staff, path + "/suspend", request, key)).StatusCode);
        var list = await manager.GetFromJsonAsync<JsonElement>("/api/v1/customers/delegations");
        var currentId = list.EnumerateArray().Single(d => d.GetProperty("state").GetString() == "active").GetProperty("id").GetGuid();
        await manager.PostAsJsonAsync("/api/v1/customers/delegations/" + currentId + "/revoke", new { });
        Assert.Equal(HttpStatusCode.Forbidden, (await Post(staff, path + "/suspend", request, key)).StatusCode);
    }

    [LocalCustomerPostgresFact]
    public async Task Production_suspension_source_reads_real_contracts_and_rounds_without_leaking_restricted_records()
    {
        await using var f = await Fixture.Create(productionSource: true); using var manager = await f.Client("manager"); using var staff = await f.Client("staff");
        var code = await f.Customer(suspended: false); var path = "/api/v1/customers/" + code;
        await f.Execute("""
            INSERT INTO qtkd.contract(customer_id,title,contract_type,start_date,end_date,contract_value,payment_terms,content,status,owner_id,owning_department_id)
            SELECT c.customer_id,'Visible review fixture','Logistics','2026-01-01','2027-01-01',1000,'30 ngày','Review','Approved',u.user_id,u.department_id
            FROM qtkd.customer c JOIN qtkd.user_account u ON u.user_id=@owner WHERE c.customer_code=@code
            """, ("code", code), ("owner", f.Users["staff"]));
        await f.Execute("""
            INSERT INTO qtkd.contract(customer_id,title,contract_type,start_date,end_date,contract_value,payment_terms,content,status,owner_id,owning_department_id)
            SELECT c.customer_id,'Hidden peer contract','Logistics','2026-01-01','2027-01-01',1000,'30 ngày','Review','Approved',u.user_id,u.department_id
            FROM qtkd.customer c JOIN qtkd.user_account u ON u.user_id=@owner WHERE c.customer_code=@code
            """, ("code", code), ("owner", f.Users["other"]));
        await f.Execute("""
            INSERT INTO qtkd.approval_round(record_type,contract_id,record_version,round_no,submitted_by,result,record_snapshot)
            SELECT 'Contract',k.contract_id,k.version,1,k.owner_id,'Running','{}'::jsonb FROM qtkd.contract k
            JOIN qtkd.customer c USING(customer_id) WHERE c.customer_code=@code AND k.owner_id=@owner
            """, ("code", code), ("owner", f.Users["staff"]));
        var unassignedManager = await manager.GetFromJsonAsync<JsonElement>(path + "/suspension-review");
        Assert.Empty(unassignedManager.GetProperty("items").EnumerateArray());
        Assert.Contains(unassignedManager.GetProperty("missingSources").EnumerateArray(), x => x.GetString() == "restricted_contracts");
        await f.AssignSalesManager();
        var review = await manager.GetFromJsonAsync<JsonElement>(path + "/suspension-review");
        Assert.Equal(3, review.GetProperty("items").GetArrayLength());
        Assert.Contains(review.GetProperty("missingSources").EnumerateArray(), x => x.GetString() == "operations_jobs");
        Assert.Contains(review.GetProperty("missingSources").EnumerateArray(), x => x.GetString() == "unbilled_services");
        Assert.Empty(review.GetProperty("notificationDepartments").EnumerateArray());
        var oldToken = review.GetProperty("reviewToken").GetString();
        await f.Execute("UPDATE qtkd.contract SET status='Active' WHERE owner_id=@id AND title='Visible review fixture'", ("id", f.Users["staff"]));
        Assert.NotEqual(oldToken, await ReviewToken(manager, path));
        Assert.Equal(HttpStatusCode.OK, (await manager.PostAsJsonAsync("/api/v1/customers/delegations", new { granteeId = f.Users["staff"], action = "suspend" })).StatusCode);
        var limitedResponse = await staff.GetAsync(path + "/suspension-review"); var limitedText = await limitedResponse.Content.ReadAsStringAsync();
        Assert.Equal(HttpStatusCode.OK, limitedResponse.StatusCode); Assert.DoesNotContain("Hidden peer contract", limitedText);
        var limited = JsonSerializer.Deserialize<JsonElement>(limitedText);
        Assert.Equal(2, limited.GetProperty("items").GetArrayLength());
        Assert.Contains(limited.GetProperty("missingSources").EnumerateArray(), x => x.GetString() == "restricted_contracts");
        Assert.Equal("REVIEW_INCOMPLETE", await Error(await Post(manager, path + "/suspend", Suspend(await ReviewToken(manager, path)), Guid.NewGuid().ToString())));
        var view = await manager.GetFromJsonAsync<JsonElement>(path); Assert.Equal("active", view.GetProperty("status").GetString());
    }

    [LocalCustomerPostgresFact]
    public async Task Reactivation_checks_sources_version_idempotency_concurrency_and_atomic_history()
    {
        await using var f = await Fixture.Create(); using var manager = await f.Client("manager"); using var staff = await f.Client("staff");
        var code = await f.Customer(); var path = "/api/v1/customers/" + code;
        using var forbidden = await Post(staff, path + "/reactivate", Reactivate(), Guid.NewGuid().ToString());
        Assert.True(forbidden.StatusCode == HttpStatusCode.Forbidden,
            $"Expected Forbidden, got {forbidden.StatusCode}: {await forbidden.Content.ReadAsStringAsync()}");
        manager.DefaultRequestHeaders.Remove("X-QTKD-CSRF");
        Assert.Equal("CSRF_REJECTED", await Error(await Post(manager, path + "/reactivate", Reactivate(), Guid.NewGuid().ToString())));
        manager.DefaultRequestHeaders.Add("X-QTKD-CSRF", "1");
        Assert.Equal("IDEMPOTENCY_KEY_REQUIRED", await Error(await Post(manager, path + "/reactivate", Reactivate())));
        Assert.Equal("VALIDATION", await Error(await Post(manager, path + "/reactivate", Reactivate(reason: " "), Guid.NewGuid().ToString())));
        Assert.Equal("EVIDENCE_UNAVAILABLE", await Error(await Post(manager, path + "/reactivate",
            new { baseVersion = 1, reason = "File not stored", evidence = new[] { new { name = "fake.pdf", size = 100 } } }, Guid.NewGuid().ToString())));
        Assert.Equal("CONFLICT", await Error(await Post(manager, path + "/reactivate", Reactivate(99), Guid.NewGuid().ToString())));
        var unknown = await manager.GetFromJsonAsync<JsonElement>(path + "/reactivation-context");
        Assert.False(unknown.GetProperty("canReactivate").GetBoolean());
        Assert.Equal("REVIEW_INCOMPLETE", await Error(await Post(manager, path + "/reactivate", Reactivate(), Guid.NewGuid().ToString())));
        f.Source.Complete = true;
        Assert.Equal("CONDITIONS_NOT_MET", await Error(await Post(manager, path + "/reactivate",
            new { baseVersion = 1, reason = "Không được tự xác nhận ngoại lệ", evidence = Array.Empty<object>(), exception = new { decisionNo = "FAKE", content = "fake" } }, Guid.NewGuid().ToString())));
        f.Source.Allowed = true; f.Source.Missing = true;
        Assert.Equal("REVIEW_INCOMPLETE", await Error(await Post(manager, path + "/reactivate", Reactivate(), Guid.NewGuid().ToString())));
        f.Source.Missing = false; f.Source.Basis = null;
        Assert.Equal("REVIEW_INCOMPLETE", await Error(await Post(manager, path + "/reactivate", Reactivate(), Guid.NewGuid().ToString())));
        f.Source.Basis = "Xác nhận từ nguồn thử"; f.Source.CheckStatus = "unknown";
        Assert.Equal("CONDITIONS_NOT_MET", await Error(await Post(manager, path + "/reactivate", Reactivate(), Guid.NewGuid().ToString())));
        f.Source.CheckStatus = "met";
        var noDecision = await f.Customer(decision: false);
        Assert.Equal("REVIEW_INCOMPLETE", await Error(await Post(manager, "/api/v1/customers/" + noDecision + "/reactivate", Reactivate(), Guid.NewGuid().ToString())));

        // Force a storage failure after state/decision/audit writes; everything must roll back.
        await f.Execute("ALTER TABLE qtkd.customer_status_outbox ADD CONSTRAINT customer_test_reject CHECK (payload->>'reason' <> 'simulate outbox failure')");
        try
        {
            Assert.Equal(HttpStatusCode.Conflict, (await Post(manager, path + "/reactivate", Reactivate(reason: "simulate outbox failure"), Guid.NewGuid().ToString())).StatusCode);
            var unchanged = await manager.GetFromJsonAsync<JsonElement>(path);
            Assert.Equal("suspended", unchanged.GetProperty("status").GetString()); Assert.Equal(1, unchanged.GetProperty("version").GetInt32());
            Assert.Single(unchanged.GetProperty("statusDecisions").EnumerateArray());
        }
        finally { await f.Execute("ALTER TABLE qtkd.customer_status_outbox DROP CONSTRAINT customer_test_reject"); }

        var keys = new[] { Guid.NewGuid().ToString(), Guid.NewGuid().ToString() };
        var responses = await Task.WhenAll(keys.Select(key => Post(manager, path + "/reactivate", Reactivate(), key)));
        Assert.Equal(new[] { HttpStatusCode.OK, HttpStatusCode.Conflict }, responses.Select(r => r.StatusCode).Order().ToArray());
        var winner = Array.FindIndex(responses, r => r.StatusCode == HttpStatusCode.OK);
        var success = await responses[winner].Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("active", success.GetProperty("customer").GetProperty("status").GetString());
        Assert.Equal(2, success.GetProperty("customer").GetProperty("version").GetInt32());
        Assert.True((await (await Post(manager, path + "/reactivate", Reactivate(), keys[winner])).Content.ReadFromJsonAsync<JsonElement>()).GetProperty("replayed").GetBoolean());
        Assert.Equal("IDEMPOTENCY_KEY_REUSED", await Error(await Post(manager, path + "/reactivate", Reactivate(reason: "Other body"), keys[winner])));
        Assert.Equal("ALREADY_IN_STATUS", await Error(await Post(manager, path + "/reactivate", Reactivate(2), Guid.NewGuid().ToString())));
        await using var find = new NpgsqlCommand("SELECT customer_id FROM qtkd.customer WHERE customer_code=@code", f.Db);
        find.Parameters.AddWithValue("code", code); var id = (Guid)(await find.ExecuteScalarAsync())!;
        Assert.Equal(2, await f.Count("SELECT count(*) FROM qtkd.customer_status_decision WHERE customer_id=@id", id)); // legacy + new
        Assert.Equal(1, await f.Count("SELECT count(*) FROM qtkd.customer_status_outbox o JOIN qtkd.customer_status_decision d USING(decision_id) WHERE d.customer_id=@id", id));
        Assert.Equal(1, await f.Count("SELECT count(*) FROM qtkd.audit_log WHERE entity_id=@id AND action='CUSTOMER_REACTIVATED'", id));
        Assert.Equal(1, await f.Count("SELECT count(*) FROM qtkd.customer_operation WHERE customer_id=@id AND operation='reactivate'", id));
    }

    [LocalCustomerPostgresFact]
    public async Task Delegation_checks_recipient_owner_expiry_revocation_and_running_request()
    {
        await using var f = await Fixture.Create(); using var manager = await f.Client("manager"); using var employee = await f.Client("staff");
        var code = await f.Customer(); var peer = await f.Customer("other"); var path = "/api/v1/customers/" + code;
        f.Source.Complete = true; f.Source.Allowed = true;
        Assert.Equal(HttpStatusCode.Forbidden, (await employee.GetAsync("/api/v1/customers/delegations")).StatusCode);
        var candidates = await manager.GetFromJsonAsync<JsonElement>("/api/v1/customers/delegations/candidates");
        Assert.Contains(candidates.EnumerateArray(), c => c.GetProperty("id").GetGuid() == f.Users["staff"]);
        Assert.DoesNotContain(candidates.EnumerateArray(), c => c.GetProperty("id").GetGuid() == f.Users["outside"]);
        foreach (var invalid in new[] { f.Users["manager"], f.Users["outside"], Guid.Empty })
            Assert.Equal(HttpStatusCode.BadRequest, (await manager.PostAsJsonAsync("/api/v1/customers/delegations", new { granteeId = invalid, action = "reactivate" })).StatusCode);
        Assert.Equal("DELEGATION_EXPIRY_INVALID", await Error(await manager.PostAsJsonAsync("/api/v1/customers/delegations",
            new { granteeId = f.Users["staff"], action = "reactivate", expiresAt = DateTimeOffset.UtcNow.AddMinutes(-1) })));
        var body = new { granteeId = f.Users["staff"], action = "reactivate", reason = "Ủy quyền kiểm thử" };
        var grants = await Task.WhenAll(manager.PostAsJsonAsync("/api/v1/customers/delegations", body), manager.PostAsJsonAsync("/api/v1/customers/delegations", body));
        Assert.Equal(new[] { HttpStatusCode.OK, HttpStatusCode.Conflict }, grants.Select(r => r.StatusCode).Order().ToArray());
        var grant = await grants.Single(r => r.StatusCode == HttpStatusCode.OK).Content.ReadFromJsonAsync<JsonElement>();
        var grantId = grant.GetProperty("id").GetGuid();
        var permission = await employee.GetFromJsonAsync<JsonElement>(path + "/status-permissions");
        Assert.False(permission.GetProperty("canSuspend").GetBoolean()); Assert.True(permission.GetProperty("canReactivate").GetBoolean());
        Assert.Equal(HttpStatusCode.Forbidden, (await Post(employee, "/api/v1/customers/" + peer + "/reactivate", Reactivate(), Guid.NewGuid().ToString())).StatusCode);
        var revoke = "/api/v1/customers/delegations/" + grantId + "/revoke";
        Assert.Equal(HttpStatusCode.OK, (await manager.PostAsJsonAsync(revoke, new { })).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await manager.PostAsJsonAsync(revoke, new { })).StatusCode);
        Assert.Equal(1, await f.Count("SELECT count(*) FROM qtkd.audit_log WHERE entity_id=@id AND action='CUSTOMER_DELEGATION_REVOKED'", grantId));
        Assert.Equal(HttpStatusCode.Forbidden, (await Post(employee, path + "/reactivate", Reactivate(), Guid.NewGuid().ToString())).StatusCode);

        var timed = await manager.PostAsJsonAsync("/api/v1/customers/delegations", new { granteeId = f.Users["staff"], action = "reactivate", expiresAt = DateTimeOffset.UtcNow.AddHours(1) });
        var timedId = (await timed.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetGuid();
        await f.Execute("UPDATE qtkd.customer_status_delegation SET granted_at=clock_timestamp()-interval '2 minutes',expires_at=clock_timestamp()-interval '1 minute' WHERE delegation_id=@id", ("id", timedId));
        permission = await employee.GetFromJsonAsync<JsonElement>(path + "/status-permissions");
        Assert.False(permission.GetProperty("canReactivate").GetBoolean());
        Assert.Equal(HttpStatusCode.Forbidden, (await Post(employee, path + "/reactivate", Reactivate(), Guid.NewGuid().ToString())).StatusCode);

        // Expiry is rechecked after loading a slow authoritative source.
        var expires = DateTimeOffset.UtcNow.AddSeconds(3);
        Assert.Equal(HttpStatusCode.OK, (await manager.PostAsJsonAsync("/api/v1/customers/delegations",
            new { granteeId = f.Users["staff"], action = "reactivate", expiresAt = expires })).StatusCode);
        f.Source.Started = new(TaskCreationOptions.RunContinuationsAsynchronously); f.Source.Continue = new(TaskCreationOptions.RunContinuationsAsynchronously);
        var pending = Post(employee, path + "/reactivate", Reactivate(), Guid.NewGuid().ToString());
        await f.Source.Started.Task.WaitAsync(TimeSpan.FromSeconds(10));
        var delay = expires - DateTimeOffset.UtcNow + TimeSpan.FromMilliseconds(200);
        if (delay > TimeSpan.Zero) await Task.Delay(delay);
        f.Source.Continue.SetResult(true);
        Assert.Equal(HttpStatusCode.Forbidden, (await pending).StatusCode);
        Assert.Equal("suspended", (await employee.GetFromJsonAsync<JsonElement>(path)).GetProperty("status").GetString());

        var renewed = await manager.PostAsJsonAsync("/api/v1/customers/delegations", body);
        var renewedId = (await renewed.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetGuid();
        f.Source.Started = new(TaskCreationOptions.RunContinuationsAsynchronously); f.Source.Continue = new(TaskCreationOptions.RunContinuationsAsynchronously);
        var running = Post(employee, path + "/reactivate", Reactivate(), Guid.NewGuid().ToString());
        await f.Source.Started.Task.WaitAsync(TimeSpan.FromSeconds(10));
        var revoking = manager.PostAsJsonAsync($"/api/v1/customers/delegations/{renewedId}/revoke", new { });
        await Task.Delay(200); Assert.False(revoking.IsCompleted);
        f.Source.Continue.SetResult(true);
        Assert.Equal(HttpStatusCode.OK, (await running).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await revoking).StatusCode);
        permission = await employee.GetFromJsonAsync<JsonElement>(path + "/status-permissions");
        Assert.False(permission.GetProperty("canReactivate").GetBoolean());
    }
}
