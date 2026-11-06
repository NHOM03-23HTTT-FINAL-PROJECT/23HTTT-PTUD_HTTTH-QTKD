using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
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

        public async Task<ReactivationSourceResult> Reactivation(Guid customerId,
            Guid actorId, string? reasonGroup, StatusException? exception, CancellationToken ct)
        {
            Started?.TrySetResult(true);
            if (Continue is { } continuation) await continuation.Task.WaitAsync(ct);
            return new(Complete, Allowed, Missing ? ["debt"] : [],
                [new("debt", "Công nợ", CheckStatus, "Nguồn kiểm thử có kiểm soát")], Basis);
        }
    }

    private sealed class CustomerFactory(string connection, ControlledSource source) : WebApplicationFactory<Program>
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
                services.RemoveAll<ICustomerStatusSource>();
                services.AddSingleton<ICustomerStatusSource>(source);
            });
        }
    }

    private sealed class Fixture(NpgsqlConnection db, CustomerFactory factory, Dictionary<string, Guid> users,
        Dictionary<string, string> names, ControlledSource source) : IAsyncDisposable
    {
        public NpgsqlConnection Db => db;
        public ControlledSource Source => source;
        public Dictionary<string, Guid> Users => users;
        public static async Task<Fixture> Create()
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
            var source = new ControlledSource(); return new(db, new(connection, source), users, names, source);
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

        // A suspended legacy fixture is data setup, never a call to the removed SYS-CUS-03 implementation.
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
        public async ValueTask DisposeAsync() { factory.Dispose(); await db.DisposeAsync(); }
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
    public async Task Removed_suspension_endpoints_do_not_mutate_customers()
    {
        await using var f = await Fixture.Create(); using var manager = await f.Client("manager");
        var code = await f.Customer(suspended: false); var path = "/api/v1/customers/" + code;
        Assert.Equal(HttpStatusCode.NotFound, (await manager.GetAsync(path + "/suspension-review")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await Post(manager, path + "/suspend", new { baseVersion = 1, reason = "Removed" }, Guid.NewGuid().ToString())).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await manager.PostAsJsonAsync("/api/v1/customers/delegations", new { granteeId = f.Users["staff"], action = "suspend" })).StatusCode);
        var permissions = await manager.GetFromJsonAsync<JsonElement>(path + "/status-permissions");
        Assert.False(permissions.GetProperty("canSuspend").GetBoolean());
        var view = await manager.GetFromJsonAsync<JsonElement>(path);
        Assert.Equal("active", view.GetProperty("status").GetString()); Assert.Equal(1, view.GetProperty("version").GetInt32());
        Assert.Empty(view.GetProperty("statusDecisions").EnumerateArray());
    }

    [LocalCustomerPostgresFact]
    public async Task Reactivation_checks_sources_version_idempotency_concurrency_and_atomic_history()
    {
        await using var f = await Fixture.Create(); using var manager = await f.Client("manager"); using var staff = await f.Client("staff");
        var code = await f.Customer(); var path = "/api/v1/customers/" + code;
        Assert.Equal(HttpStatusCode.Forbidden, (await Post(staff, path + "/reactivate", Reactivate(), Guid.NewGuid().ToString())).StatusCode);
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
