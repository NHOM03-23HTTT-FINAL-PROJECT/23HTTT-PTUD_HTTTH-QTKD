using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using QTKD.Infrastructure.Persistence;
using AuditLog = QTKD.Infrastructure.Persistence.Schema.AuditLog;
using Xunit;

namespace QTKD.IntegrationTests;

// UC-CHUNG-06 · Identity actions recorded in qtkd.audit_log (login, failed login, logout, password change).
// Runs through the real pipeline with SQLite; PostgreSQL append-only behaviour is covered by the rollback suites.
public sealed class IdentityAuditTests : IDisposable
{
    private readonly ApiFactory factory = new();
    public void Dispose() => factory.Dispose();

    private async Task<HttpClient> Login(string user, string password)
    {
        var client = await factory.Client();
        var login = await client.PostAsJsonAsync("/api/v1/auth/login", new { identifier = factory.Prefix + "." + user, password });
        if (password == factory.Password) login.EnsureSuccessStatusCode();
        if (password == factory.Password)
        {
            var auth = await login.Content.ReadFromJsonAsync<JsonElement>();
            client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", auth.GetProperty("accessToken").GetString());
        }
        return client;
    }

    private async Task<List<AuditLog>> Rows(string action)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<IdentityDbContext>();
        return await db.AuditLogs.AsNoTracking().Where(l => l.Action == action).ToListAsync();
    }

    // value_before/value_after are jsonb in PostgreSQL and EF inserts both, even when null.
    // SQLite does not enforce the type, so pin the mapping in the model instead.
    [Theory]
    [InlineData(nameof(AuditLog.ValueBefore))]
    [InlineData(nameof(AuditLog.ValueAfter))]
    public void Audit_value_columns_are_mapped_as_jsonb(string name)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<IdentityDbContext>();
        var property = db.Model.FindEntityType(typeof(AuditLog))!.FindProperty(name)!;
        Assert.Equal("jsonb", property.GetColumnType());
    }

    [Fact]
    public async Task Successful_login_is_recorded_for_the_user_without_secrets()
    {
        await Login("staff", factory.Password);

        var row = Assert.Single(await Rows("LOGIN_SUCCESS"));
        Assert.Equal((factory.StaffId, "UserAccount", factory.StaffId), (row.ActorId, row.EntityType, row.EntityId));
        Assert.DoesNotContain(factory.Password, row.ValueAfter ?? "");
        Assert.DoesNotContain("token", (row.ValueAfter ?? "").ToLowerInvariant());
    }

    [Fact]
    public async Task Wrong_password_is_recorded_with_the_failed_count()
    {
        var client = await factory.Client();
        var response = await client.PostAsJsonAsync("/api/v1/auth/login", new { identifier = factory.Prefix + ".staff", password = "Not.The.Password1" });
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);

        var row = Assert.Single(await Rows("LOGIN_FAILED"));
        Assert.Equal(factory.StaffId, row.ActorId);
        var value = JsonDocument.Parse(row.ValueAfter!).RootElement;
        Assert.Equal((1, "wrong-password"), (value.GetProperty("failedCount").GetInt32(), value.GetProperty("reason").GetString()));
        Assert.DoesNotContain("Not.The.Password1", row.ValueAfter!);
    }

    [Fact]
    public async Task Deliberate_logout_is_recorded_but_replacing_a_session_on_login_is_not()
    {
        var client = await Login("staff", factory.Password);
        // A second sign-in in the same browser replaces the first session; that is not a user sign-out.
        await Login("staff", factory.Password);
        Assert.Empty(await Rows("LOGOUT"));

        var logout = await client.PostAsync("/api/v1/auth/logout", null);
        Assert.Equal(HttpStatusCode.NoContent, logout.StatusCode);
        var row = Assert.Single(await Rows("LOGOUT"));
        Assert.Equal(factory.StaffId, row.ActorId);
    }

    [Fact]
    public async Task Password_change_is_recorded()
    {
        var client = await Login("staff", factory.Password);
        var change = await client.PostAsJsonAsync("/api/v1/auth/password/change", new { currentPassword = factory.Password, newPassword = "Changed.Password@2026" });
        Assert.Equal(HttpStatusCode.OK, change.StatusCode);

        var row = Assert.Single(await Rows("PASSWORD_CHANGED"));
        Assert.Equal((factory.StaffId, factory.StaffId), (row.ActorId, row.EntityId));
        Assert.Null(row.ValueAfter);
    }
}
