using System.Net;
using System.Diagnostics;
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
using QTKD.Infrastructure.Customers;
using Xunit;

namespace QTKD.IntegrationTests;

// This suite accepts only the fixed loopback database used by the disposable test
// container. It deliberately has no fallback to the application's configuration.
public sealed class LocalCustomerPostgresFactAttribute : FactAttribute
{
    public LocalCustomerPostgresFactAttribute()
    {
        if (Environment.GetEnvironmentVariable("QTKD_CUSTOMER_TEST_DISPOSABLE") != "true")
            Skip = "Requires the explicitly disposable local customer test database.";
    }
}

public sealed class CustomerStatusPostgresTests
{
    private sealed class ControlledSource : ICustomerStatusSource
    {
        public bool Complete { get; set; }
        public bool AllowReactivation { get; set; }
        public bool HasImpact { get; set; }
        public bool HasOtherMissingSource { get; set; }
        public Task<SuspensionReview> Suspension(NpgsqlConnection c, NpgsqlTransaction tx, Guid customerId, Guid actorId, CancellationToken ct)
        {
            StatusImpactItem[] items = HasImpact
                ? [new("contract-1", "contract", "Còn hiệu lực", "HD-TEST", "Hợp đồng thử", "", "Active", "success",
                    "Pháp chế", ["Giữ nguyên", "Rà soát"], "Không tự hủy")]
                : [];
            return Task.FromResult(new SuspensionReview(items, Complete ? [] : ["job"],
                MissingSources: HasOtherMissingSource ? ["debt"] : []));
        }
        public Task<ReactivationSourceResult> Reactivation(NpgsqlConnection c, NpgsqlTransaction tx, Guid customerId,
            Guid actorId, string? reasonGroup, StatusException? exception, CancellationToken ct) =>
            Task.FromResult(new ReactivationSourceResult(Complete, AllowReactivation, Complete && !HasOtherMissingSource ? [] : ["debt"],
                [new("debt", "Công nợ", AllowReactivation ? "met" : "unmet", "Kế toán thử nghiệm")],
                AllowReactivation ? "Xác nhận Kế toán thử nghiệm" : null));
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
                ["Jwt:Issuer"] = "qtkd-api",
                ["Jwt:Audience"] = "qtkd-web"
            }));
            builder.ConfigureTestServices(services =>
            {
                services.RemoveAll<ICustomerStatusSource>();
                services.AddSingleton<ICustomerStatusSource>(source);
            });
        }
    }

    private static async Task<JsonElement> Login(HttpClient client, string username)
    {
        var response = await client.PostAsJsonAsync("/api/v1/auth/login", new { identifier = username, password = "Customer.Test@2026" });
        response.EnsureSuccessStatusCode();
        var result = await response.Content.ReadFromJsonAsync<JsonElement>();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", result.GetProperty("accessToken").GetString());
        return result;
    }

    private static async Task<HttpResponseMessage> Post(HttpClient client, string path, object body, string key)
    {
        using var request = new HttpRequestMessage(HttpMethod.Post, path) { Content = JsonContent.Create(body) };
        request.Headers.Add("Idempotency-Key", key);
        return await client.SendAsync(request);
    }

    private static async Task<string?> Code(HttpResponseMessage response) =>
        (await response.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("code").GetString();

    [LocalCustomerPostgresFact]
    public async Task Status_flow_checks_authority_sources_concurrency_and_atomic_history()
    {
        var port = int.Parse(Environment.GetEnvironmentVariable("QTKD_CUSTOMER_TEST_PORT") ?? "0");
        if (port is < 1024 or > 65535) throw new InvalidOperationException("A disposable loopback database port is required.");
        var connection = $"Host=127.0.0.1;Port={port};Database=qtkdtest;Username=postgres;Password=qtkd-test-only;SSL Mode=Disable";
        await using var db = new NpgsqlConnection(connection); await db.OpenAsync();
        var marker = Guid.NewGuid().ToString("N")[..10];
        var manager = $"status.{marker}.manager"; var staff = $"status.{marker}.staff";
        var hash = BCrypt.Net.BCrypt.HashPassword("Customer.Test@2026", 10);
        foreach (var (username, role) in new[] { (manager, "SalesManager"), (staff, "SalesStaff") })
        {
            await using var user = new NpgsqlCommand("""
                INSERT INTO qtkd.user_account(username,company_email,password_hash,full_name,department_id,role,status,must_change_password)
                SELECT @name,@email,@hash,@name,department_id,@role::qtkd.user_role,'Active',false FROM qtkd.department WHERE code='KD'
                """, db);
            user.Parameters.AddWithValue("name", username); user.Parameters.AddWithValue("email", username + "@example.invalid");
            user.Parameters.AddWithValue("hash", hash); user.Parameters.AddWithValue("role", role); await user.ExecuteNonQueryAsync();
        }
        string customerCode;
        await using (var insert = new NpgsqlCommand("""
            INSERT INTO qtkd.customer(customer_name,tax_code,address,legal_representative,phone,account_manager_id)
            SELECT 'Khách kiểm thử trạng thái',@tax,'Địa chỉ thử','Người thử','0900000000',user_id
            FROM qtkd.user_account WHERE username=@staff RETURNING customer_code
            """, db))
        {
            insert.Parameters.AddWithValue("tax", "7" + Random.Shared.Next(1_000_000_000).ToString("D9"));
            insert.Parameters.AddWithValue("staff", staff); customerCode = (string)(await insert.ExecuteScalarAsync())!;
        }
        string serviceCode;
        await using (var service = new NpgsqlCommand("INSERT INTO qtkd.service(service_name,unit,requires_area) VALUES ('Dịch vụ thử','lần',false) RETURNING service_code", db))
            serviceCode = (string)(await service.ExecuteScalarAsync())!;
        var contractDraft = new { draft = new { customerCode, sourceMode = "blank", templateCode = "", title = "Hợp đồng thử trạng thái",
            contractType = "Logistics", effectiveFrom = "2026-11-01", effectiveTo = "2027-11-01", value = "1000", paymentTerm = "30 ngày",
            content = "Nội dung thử", services = new[] { new { id = "test-line", serviceCode, serviceName = "Dịch vụ thử", unit = "lần", requiresArea = false, areaCode = "" } } } };
        var source = new ControlledSource();
        using var factory = new CustomerFactory(connection, source);
        var runBrowser = Environment.GetEnvironmentVariable("QTKD_CUSTOMER_UI_FLOW") == "true";
        if (runBrowser) factory.UseKestrel(7156);
        using var client = factory.CreateClient(new WebApplicationFactoryClientOptions { BaseAddress = new Uri("http://localhost:7156") });
        client.DefaultRequestHeaders.Add("Origin", "http://localhost:5173"); client.DefaultRequestHeaders.Add("X-QTKD-CSRF", "1");
        using var staffClient = factory.CreateClient(new WebApplicationFactoryClientOptions { BaseAddress = new Uri("http://localhost:7156") });
        staffClient.DefaultRequestHeaders.Add("Origin", "http://localhost:5173"); staffClient.DefaultRequestHeaders.Add("X-QTKD-CSRF", "1");
        await Login(client, manager); await Login(staffClient, staff);
        var path = "/api/v1/customers/" + customerCode;
        object suspend = new { baseVersion = 1, reasonGroup = "CONG_NO", reason = "Công nợ thử", evidence = Array.Empty<object>(), plan = Array.Empty<object>(), coordinationNote = "" };
        Assert.Equal(HttpStatusCode.Forbidden, (await Post(staffClient, path + "/suspend", suspend, Guid.NewGuid().ToString())).StatusCode);
        var unavailable = await Post(client, path + "/suspend", suspend, Guid.NewGuid().ToString());
        Assert.Equal(HttpStatusCode.ServiceUnavailable, unavailable.StatusCode); Assert.Equal("REVIEW_INCOMPLETE", await Code(unavailable));
        Assert.Equal("active", (await client.GetFromJsonAsync<JsonElement>(path)).GetProperty("status").GetString());

        source.Complete = true; source.HasImpact = true;
        source.HasOtherMissingSource = true;
        var missingSource = await Post(client, path + "/suspend", suspend, Guid.NewGuid().ToString());
        Assert.Equal(HttpStatusCode.ServiceUnavailable, missingSource.StatusCode);
        Assert.Equal("REVIEW_INCOMPLETE", await Code(missingSource));
        source.HasOtherMissingSource = false;
        var missingPlan = await Post(client, path + "/suspend", suspend, Guid.NewGuid().ToString());
        Assert.Equal(HttpStatusCode.Conflict, missingPlan.StatusCode);
        suspend = new { baseVersion = 1, reasonGroup = "CONG_NO", reason = "Công nợ thử", evidence = Array.Empty<object>(),
            plan = new[] { new { id = "contract-1", option = "Giữ nguyên" } }, coordinationNote = "Kế toán tiếp tục đối chiếu" };
        var key = Guid.NewGuid().ToString();
        var saved = await Post(client, path + "/suspend", suspend, key);
        Assert.Equal(HttpStatusCode.OK, saved.StatusCode);
        var body = await saved.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal("suspended", body.GetProperty("customer").GetProperty("status").GetString());
        Assert.Equal(2, body.GetProperty("customer").GetProperty("version").GetInt32());
        var blockedContract = await Post(staffClient, "/api/v1/contracts", contractDraft, Guid.NewGuid().ToString());
        Assert.Equal(HttpStatusCode.Conflict, blockedContract.StatusCode); Assert.Equal("CUSTOMER_INACTIVE", await Code(blockedContract));
        var replay = await Post(client, path + "/suspend", suspend, key);
        Assert.True((await replay.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("replayed").GetBoolean());
        var reused = await Post(client, path + "/suspend", new { baseVersion = 1, reasonGroup = "CONG_NO", reason = "Nội dung khác", evidence = Array.Empty<object>(),
            plan = new[] { new { id = "contract-1", option = "Giữ nguyên" } }, coordinationNote = "" }, key);
        Assert.Equal("IDEMPOTENCY_KEY_REUSED", await Code(reused));
        var repeat = await Post(client, path + "/suspend", suspend, Guid.NewGuid().ToString());
        Assert.Equal("ALREADY_IN_STATUS", await Code(repeat));

        var reactivate = new { baseVersion = 2, reason = "Tiếp tục hợp tác", evidence = Array.Empty<object>(),
            exception = new { decisionNo = "CHUA-DUYET", content = "Chưa xác minh" } };
        var context = await client.GetFromJsonAsync<JsonElement>(path + "/reactivation-context");
        Assert.False(context.GetProperty("canReactivate").GetBoolean());
        var unmet = await Post(client, path + "/reactivate", reactivate, Guid.NewGuid().ToString());
        Assert.Equal(HttpStatusCode.Conflict, unmet.StatusCode); Assert.Equal("CONDITIONS_NOT_MET", await Code(unmet));
        Assert.Equal("suspended", (await client.GetFromJsonAsync<JsonElement>(path)).GetProperty("status").GetString());
        source.AllowReactivation = true;
        source.HasOtherMissingSource = true;
        context = await client.GetFromJsonAsync<JsonElement>(path + "/reactivation-context");
        Assert.False(context.GetProperty("canReactivate").GetBoolean());
        var missingReactivationSource = await Post(client, path + "/reactivate", reactivate, Guid.NewGuid().ToString());
        Assert.Equal(HttpStatusCode.ServiceUnavailable, missingReactivationSource.StatusCode);
        Assert.Equal("REVIEW_INCOMPLETE", await Code(missingReactivationSource));
        source.HasOtherMissingSource = false;
        context = await client.GetFromJsonAsync<JsonElement>(path + "/reactivation-context");
        Assert.True(context.GetProperty("canReactivate").GetBoolean());
        var approved = await Post(client, path + "/reactivate", new { baseVersion = 2, reason = "Đã xử lý", evidence = Array.Empty<object>() }, Guid.NewGuid().ToString());
        Assert.Equal(HttpStatusCode.OK, approved.StatusCode);
        Assert.Equal("active", (await approved.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("customer").GetProperty("status").GetString());
        var allowedContract = await Post(staffClient, "/api/v1/contracts", contractDraft, Guid.NewGuid().ToString());
        Assert.Equal(HttpStatusCode.OK, allowedContract.StatusCode);
        var contractCode = (await allowedContract.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("contract").GetProperty("code").GetString();

        object competing = new { baseVersion = 3, reasonGroup = "CONG_NO", reason = "Kiểm tra đồng thời", evidence = Array.Empty<object>(),
            plan = new[] { new { id = "contract-1", option = "Giữ nguyên" } }, coordinationNote = "" };
        var outcomes = await Task.WhenAll(Post(client, path + "/suspend", competing, Guid.NewGuid().ToString()),
            Post(client, path + "/suspend", competing, Guid.NewGuid().ToString()));
        Assert.Equal(new[] { HttpStatusCode.OK, HttpStatusCode.Conflict }, outcomes.Select(x => x.StatusCode).Order().ToArray());
        var existingContract = await staffClient.GetFromJsonAsync<JsonElement>("/api/v1/contracts/" + contractCode);
        Assert.Equal("draft", existingContract.GetProperty("status").GetString());

        // A failure in the outbox insert must roll back the decision, audit and status together.
        await using (var constrain = new NpgsqlCommand("ALTER TABLE qtkd.customer_status_outbox ADD CONSTRAINT customer_test_reject CHECK (payload->>'reason' <> 'simulate outbox failure')", db))
            await constrain.ExecuteNonQueryAsync();
        try
        {
            var failed = await Post(client, path + "/reactivate", new { baseVersion = 4, reason = "simulate outbox failure", evidence = Array.Empty<object>() }, Guid.NewGuid().ToString());
            Assert.Equal(HttpStatusCode.Conflict, failed.StatusCode);
            var unchanged = await client.GetFromJsonAsync<JsonElement>(path);
            Assert.Equal("suspended", unchanged.GetProperty("status").GetString()); Assert.Equal(4, unchanged.GetProperty("version").GetInt32());
        }
        finally
        {
            await using var drop = new NpgsqlCommand("ALTER TABLE qtkd.customer_status_outbox DROP CONSTRAINT customer_test_reject", db);
            await drop.ExecuteNonQueryAsync();
        }
        var restored = await Post(client, path + "/reactivate", new { baseVersion = 4, reason = "Đã xác nhận lại", evidence = Array.Empty<object>() }, Guid.NewGuid().ToString());
        Assert.Equal(HttpStatusCode.OK, restored.StatusCode);

        await using (var counts = new NpgsqlCommand("""
            SELECT (SELECT count(*) FROM qtkd.customer_status_decision WHERE customer_id=c.customer_id),
                   (SELECT count(*) FROM qtkd.customer_status_outbox o JOIN qtkd.customer_status_decision d USING(decision_id) WHERE d.customer_id=c.customer_id),
                   (SELECT count(*) FROM qtkd.audit_log a WHERE a.entity_id=c.customer_id AND a.action IN ('CUSTOMER_SUSPENDED','CUSTOMER_REACTIVATED'))
            FROM qtkd.customer c WHERE c.customer_code=@code
            """, db))
        {
            counts.Parameters.AddWithValue("code", customerCode);
            await using var reader = await counts.ExecuteReaderAsync(); Assert.True(await reader.ReadAsync());
            Assert.Equal(4L, reader.GetInt64(0)); Assert.Equal(4L, reader.GetInt64(1)); Assert.Equal(4L, reader.GetInt64(2));
        }
        if (runBrowser)
        {
            var repo = Environment.GetEnvironmentVariable("QTKD_CUSTOMER_REPO") ?? throw new InvalidOperationException("Test repository path is required.");
            var start = new ProcessStartInfo("node") { WorkingDirectory = Path.Combine(repo, "frontend"), RedirectStandardOutput = true, RedirectStandardError = true, UseShellExecute = false, CreateNoWindow = true };
            start.ArgumentList.Add("tests/customer-status-live-browser.mjs");
            start.Environment["QTKD_CUSTOMER_TEST_DISPOSABLE"] = "true";
            start.Environment["QTKD_UI_MANAGER"] = manager;
            start.Environment["QTKD_UI_CUSTOMER_CODE"] = customerCode;
            using var process = Process.Start(start) ?? throw new InvalidOperationException("Cannot start browser test.");
            var output = process.StandardOutput.ReadToEndAsync(); var errors = process.StandardError.ReadToEndAsync();
            await process.WaitForExitAsync(new CancellationTokenSource(TimeSpan.FromSeconds(60)).Token);
            Assert.True(process.ExitCode == 0, (await output) + "\n" + (await errors));
        }
    }
}
