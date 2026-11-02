using System.IdentityModel.Tokens.Jwt;
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Security.Claims;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.IdentityModel.Tokens;
using QTKD.Application.Features.Identity;
using QTKD.Domain.Identity;
using QTKD.Infrastructure.Persistence;
using Xunit;

namespace QTKD.IntegrationTests;

public sealed class IdentityApiTests : IDisposable
{
    private readonly ApiFactory factory = new();
    public void Dispose() => factory.Dispose();
    private async Task<JsonElement> Login(HttpClient client, string suffix = "admin", string? password = null, bool remember = false)
    {
        var response = await client.PostAsJsonAsync("/api/v1/auth/login", new { identifier = factory.Prefix + "." + suffix, password = password ?? factory.Password, remember });
        response.EnsureSuccessStatusCode(); var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", body.GetProperty("accessToken").GetString()); return body;
    }
    private async Task Mutate(Func<IdentityDbContext, Task> change)
    {
        await using var scope = factory.Services.CreateAsyncScope(); var db = scope.ServiceProvider.GetRequiredService<IdentityDbContext>();
        await change(db); await db.SaveChangesAsync();
    }
    private string Jwt(Guid userId, Guid sessionId, DateTime expires, string? issuer = null, string? audience = null, string? key = null, string algorithm = SecurityAlgorithms.HmacSha256)
        => new JwtSecurityTokenHandler().WriteToken(new JwtSecurityToken(issuer ?? "qtkd-api", audience ?? "qtkd-web",
            [new("sub", userId.ToString()), new("sid", sessionId.ToString()), new("jti", Guid.NewGuid().ToString())],
            expires.AddMinutes(-10), expires, new SigningCredentials(new SymmetricSecurityKey(Encoding.UTF8.GetBytes(key ?? factory.Key)), algorithm)));

    [Fact]
    public async Task Login_returns_standard_jwt_cookie_and_exactly_one_role()
    {
        using var client = await factory.Client();
        var response = await client.PostAsJsonAsync("/api/v1/auth/login", new { identifier = (factory.Prefix + ".admin@example.invalid").ToUpperInvariant(), password = factory.Password, remember = true });
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.True(new JwtSecurityTokenHandler().CanReadToken(body.GetProperty("accessToken").GetString()));
        Assert.Equal(1, body.GetProperty("user").GetProperty("roles").GetArrayLength());
        Assert.False(body.TryGetProperty("refreshToken", out _));
        var cookie = string.Join(";", response.Headers.GetValues("Set-Cookie"));
        Assert.Contains("httponly", cookie.ToLowerInvariant()); Assert.Contains("secure", cookie.ToLowerInvariant()); Assert.Contains("samesite=strict", cookie.ToLowerInvariant()); Assert.Contains("expires=", cookie.ToLowerInvariant());
    }
    [Fact]
    public async Task Wrong_password_and_unknown_account_do_not_issue_a_session()
    {
        using var client = await factory.Client();
        foreach (var identifier in new[] { factory.Prefix + ".staff", "missing.account" })
        {
            var response = await client.PostAsJsonAsync("/api/v1/auth/login", new { identifier, password = "Wrong.Password@2026" });
            Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
            Assert.Equal("INVALID_CREDENTIALS", (await response.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("code").GetString());
            Assert.False(response.Headers.Contains("Set-Cookie"));
        }
        await Mutate(async db => Assert.Equal(0, await db.Sessions.CountAsync(x => x.UserId == factory.StaffId)));
    }
    [Fact]
    public async Task Login_reloads_a_user_tracked_before_another_request_changed_the_password()
    {
        using var client = await factory.Client();
        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<IdentityDbContext>();
        await db.Users.SingleAsync(x => x.UserId == factory.StaffId);
        await Mutate(async other => (await other.Users.SingleAsync(x => x.UserId == factory.StaffId)).PasswordHash = BCrypt.Net.BCrypt.HashPassword(factory.Password + "Changed", 12));
        var identity = scope.ServiceProvider.GetRequiredService<IIdentityService>();
        var failure = await Assert.ThrowsAsync<IdentityFailure>(() => identity.Login(new LoginRequest(factory.Prefix + ".staff", factory.Password), null, null, default));
        Assert.Equal(401, failure.Status);
        Assert.Equal("INVALID_CREDENTIALS", failure.Code);
    }
    [Fact]
    public async Task Role_without_permissions_can_login_but_business_request_is_403()
    {
        using var client = await factory.Client(); var body = await Login(client, "accountant");
        Assert.Equal(0, body.GetProperty("user").GetProperty("permissions").GetArrayLength());
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/api/v1/auth/session")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync("/api/v1/users")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/api/v1/auth/session")).StatusCode);
    }
    [Fact]
    public async Task User_with_permission_can_access_the_same_endpoint()
    {
        using var client = await factory.Client(); await Login(client);
        var response = await client.GetAsync("/api/v1/users"); Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.DoesNotContain("passwordHash", await response.Content.ReadAsStringAsync());
    }
    [Fact]
    public async Task Missing_token_is_401_without_redirect()
    {
        using var client = await factory.Client(); var response = await client.GetAsync("/api/v1/users");
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode); Assert.Null(response.Headers.Location);
    }
    [Theory]
    [InlineData("malformed")][InlineData("signature")][InlineData("expired")][InlineData("issuer")][InlineData("audience")][InlineData("algorithm")]
    public async Task Invalid_jwt_is_401(string kind)
    {
        using var client = await factory.Client(); var login = await Login(client);
        var original = new JwtSecurityTokenHandler().ReadJwtToken(login.GetProperty("accessToken").GetString());
        var sid = Guid.Parse(original.Claims.Single(x => x.Type == "sid").Value);
        var token = kind == "malformed" ? "broken.token" : Jwt(factory.AdminId, sid,
            kind == "expired" ? DateTime.UtcNow.AddMinutes(-2) : DateTime.UtcNow.AddMinutes(5),
            issuer: kind == "issuer" ? "wrong" : null, audience: kind == "audience" ? "wrong" : null,
            key: kind == "signature" ? Convert.ToBase64String(System.Security.Cryptography.RandomNumberGenerator.GetBytes(48)) : null,
            algorithm: kind == "algorithm" ? SecurityAlgorithms.HmacSha384 : SecurityAlgorithms.HmacSha256);
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/v1/users")).StatusCode);
    }
    [Fact]
    public async Task Logout_revokes_unexpired_jwt_and_refresh_but_keeps_other_device()
    {
        using var first = await factory.Client(); using var second = await factory.Client();
        await Login(first); await Login(second);
        Assert.Equal(HttpStatusCode.NoContent, (await first.PostAsJsonAsync("/api/v1/auth/logout", new { })).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await first.GetAsync("/api/v1/users")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await first.PostAsJsonAsync("/api/v1/auth/refresh", new { })).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await second.GetAsync("/api/v1/users")).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await first.PostAsJsonAsync("/api/v1/auth/logout", new { })).StatusCode);
    }
    [Fact]
    public async Task Refresh_rotates_cookie_and_rejects_old_cookie()
    {
        using var client = await factory.Client();
        var login = await client.PostAsJsonAsync("/api/v1/auth/login", new { identifier = factory.Prefix + ".admin", password = factory.Password }); login.EnsureSuccessStatusCode();
        var oldCookie = login.Headers.GetValues("Set-Cookie").Single().Split(';')[0];
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsJsonAsync("/api/v1/auth/refresh", new { })).StatusCode);
        using var replay = await factory.Client(); replay.DefaultRequestHeaders.Add("Cookie", oldCookie);
        Assert.Equal(HttpStatusCode.Unauthorized, (await replay.PostAsJsonAsync("/api/v1/auth/refresh", new { })).StatusCode);
    }
    [Fact]
    public async Task Logout_with_cookie_captured_before_rotation_still_revokes_session()
    {
        using var client = await factory.Client();
        var login = await client.PostAsJsonAsync("/api/v1/auth/login", new { identifier = factory.Prefix + ".admin", password = factory.Password }); login.EnsureSuccessStatusCode();
        var body = await login.Content.ReadFromJsonAsync<JsonElement>();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", body.GetProperty("accessToken").GetString());
        var oldCookie = login.Headers.GetValues("Set-Cookie").Single().Split(';')[0];
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsJsonAsync("/api/v1/auth/refresh", new { })).StatusCode);
        using var logout = await factory.Client(); logout.DefaultRequestHeaders.Add("Cookie", oldCookie);
        Assert.Equal(HttpStatusCode.NoContent, (await logout.PostAsJsonAsync("/api/v1/auth/logout", new { })).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/v1/auth/session")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.PostAsJsonAsync("/api/v1/auth/refresh", new { })).StatusCode);
    }
    [PostgreSqlFact]
    public async Task Concurrent_refreshes_accept_the_same_cookie_only_once()
    {
        using var client = await factory.Client();
        var login = await client.PostAsJsonAsync("/api/v1/auth/login", new { identifier = factory.Prefix + ".admin", password = factory.Password }); login.EnsureSuccessStatusCode();
        var cookie = login.Headers.GetValues("Set-Cookie").Single().Split(';')[0];
        using var first = await factory.Client(); using var second = await factory.Client();
        first.DefaultRequestHeaders.Add("Cookie", cookie); second.DefaultRequestHeaders.Add("Cookie", cookie);
        var responses = await Task.WhenAll(first.PostAsJsonAsync("/api/v1/auth/refresh", new { }), second.PostAsJsonAsync("/api/v1/auth/refresh", new { }));
        Assert.Single(responses.Where(x => x.StatusCode == HttpStatusCode.OK));
        Assert.Single(responses.Where(x => x.StatusCode == HttpStatusCode.Unauthorized));
    }
    [Fact]
    public async Task Cookie_endpoints_reject_missing_csrf_or_untrusted_origin()
    {
        using var client = await factory.Client(); await Login(client);
        client.DefaultRequestHeaders.Remove("X-QTKD-CSRF");
        Assert.Equal(HttpStatusCode.Forbidden, (await client.PostAsJsonAsync("/api/v1/auth/logout", new { })).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/api/v1/auth/session")).StatusCode);
        client.DefaultRequestHeaders.Add("X-QTKD-CSRF", "1"); client.DefaultRequestHeaders.Remove("Origin"); client.DefaultRequestHeaders.Add("Origin", "https://untrusted.invalid");
        Assert.Equal(HttpStatusCode.Forbidden, (await client.PostAsJsonAsync("/api/v1/auth/refresh", new { })).StatusCode);
    }
    [Fact]
    public async Task Idle_and_absolute_session_expiry_are_enforced_by_server()
    {
        using var client = await factory.Client(); await Login(client);
        await Mutate(async db => { var s = await db.Sessions.SingleAsync(x => x.UserId == factory.AdminId); s.CreatedAt = DateTime.UtcNow.AddHours(-1); s.LastActivityAt = DateTime.UtcNow.AddMinutes(-31); });
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/v1/users")).StatusCode);
        await Mutate(async db => { var s = await db.Sessions.SingleAsync(x => x.UserId == factory.AdminId); s.CreatedAt = DateTime.UtcNow.AddHours(-2); s.ExpiresAt = DateTime.UtcNow.AddMinutes(-1); s.LastActivityAt = s.ExpiresAt.AddMinutes(-1); });
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.PostAsJsonAsync("/api/v1/auth/refresh", new { })).StatusCode);
    }
    [Fact]
    public async Task Session_polling_does_not_extend_idle_but_activity_does()
    {
        using var client = await factory.Client(); await Login(client);
        DateTime before = default;
        await Mutate(async db => { var s = await db.Sessions.SingleAsync(x => x.UserId == factory.AdminId); s.CreatedAt = DateTime.UtcNow.AddMinutes(-10); s.LastActivityAt = before = DateTime.UtcNow.AddMinutes(-5); });
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/api/v1/auth/session")).StatusCode);
        await Mutate(async db => Assert.True(Math.Abs((before - (await db.Sessions.SingleAsync(x => x.UserId == factory.AdminId)).LastActivityAt).TotalMilliseconds) < 0.01));
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsJsonAsync("/api/v1/auth/activity", new { })).StatusCode);
        await Mutate(async db => Assert.True((await db.Sessions.SingleAsync(x => x.UserId == factory.AdminId)).LastActivityAt > before));
    }
    [Fact]
    public async Task Temporary_password_cannot_bypass_business_policy_and_can_be_changed()
    {
        using var first = await factory.Client(); using var second = await factory.Client();
        await Login(first, "temporary"); await Login(second, "temporary");
        Assert.Equal(HttpStatusCode.OK, (await first.GetAsync("/api/v1/auth/session")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await first.GetAsync("/api/v1/users")).StatusCode);
        var response = await first.PostAsJsonAsync("/api/v1/auth/password/change", new { currentPassword = factory.Password, newPassword = "Changed.Password@2026" });
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.False((await response.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("user").GetProperty("mustChangePassword").GetBoolean());
        Assert.Equal(HttpStatusCode.Unauthorized, (await second.GetAsync("/api/v1/auth/session")).StatusCode);
        using var retry = await factory.Client(); await Login(retry, "temporary", "Changed.Password@2026");
    }
    [Fact]
    public async Task Five_failures_share_username_email_lockout_and_do_not_issue_token()
    {
        using var client = await factory.Client();
        for (int i = 0; i < 5; i++) await client.PostAsJsonAsync("/api/v1/auth/login", new { identifier = factory.Prefix + ".staff" + (i % 2 == 0 ? "" : "@example.invalid"), password = "Wrong.Password@2026" });
        Assert.Equal((HttpStatusCode)423, (await client.PostAsJsonAsync("/api/v1/auth/login", new { identifier = factory.Prefix + ".staff", password = factory.Password })).StatusCode);
    }
    [Fact]
    public async Task Missing_role_input_is_400_and_broken_role_configuration_is_500_without_session()
    {
        using var admin = await factory.Client(); await Login(admin);
        var request = new { username = factory.Prefix + ".new", email = factory.Prefix + ".new@example.invalid", fullName = "New", departmentId = factory.SalesDepartment, password = factory.Password };
        Assert.Equal(HttpStatusCode.BadRequest, (await admin.PostAsJsonAsync("/api/v1/users", request)).StatusCode);
        string? original = null;
        await Mutate(async db => { var role = await db.Roles.SingleAsync(x => x.Code == UserRole.Accountant); original = role.DepartmentCode; role.DepartmentCode = "BROKEN"; });
        try
        {
            using var client = await factory.Client();
            var response = await client.PostAsJsonAsync("/api/v1/auth/login", new { identifier = factory.Prefix + ".accountant", password = factory.Password });
            Assert.Equal(HttpStatusCode.InternalServerError, response.StatusCode);
            Assert.Equal("SYSTEM_ERROR", (await response.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("code").GetString());
            await Mutate(async db => Assert.Equal(0, await db.Sessions.CountAsync(x => x.UserId == factory.AccountantId)));
        }
        finally { await Mutate(async db => (await db.Roles.SingleAsync(x => x.Code == UserRole.Accountant)).DepartmentCode = original!); }
    }
    [Fact]
    public async Task Disabling_user_revokes_existing_session()
    {
        using var admin = await factory.Client(); using var staff = await factory.Client(); await Login(admin); await Login(staff, "staff");
        Assert.Equal(HttpStatusCode.OK, (await admin.PutAsJsonAsync("/api/v1/users/" + factory.StaffId, new { fullName = "Staff", departmentId = factory.SalesDepartment, role = "NV_KD", status = "Disabled" })).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await staff.GetAsync("/api/v1/auth/session")).StatusCode);
    }
    [Fact]
    public async Task Admin_can_create_account_with_one_role_and_must_change_password()
    {
        using var admin = await factory.Client(); await Login(admin);
        var response = await admin.PostAsJsonAsync("/api/v1/users", new { username = factory.Prefix + ".new", email = factory.Prefix + ".new@example.invalid", fullName = "New Test", departmentId = factory.SalesDepartment, role = "NV_KD", password = factory.Password });
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>(); Assert.True(body.GetProperty("mustChangePassword").GetBoolean());
        Assert.Equal("NV_KD", body.GetProperty("roles")[0].GetString());
        Assert.Equal("Active", body.GetProperty("status").GetString());
        Assert.Equal(HttpStatusCode.OK, (await admin.GetAsync(response.Headers.Location)).StatusCode);
        using var user = await factory.Client(); await Login(user, "new");
    }
    [Fact]
    public async Task Grant_changes_take_effect_without_reissuing_jwt()
    {
        using var admin = await factory.Client(); using var accountant = await factory.Client(); await Login(admin); await Login(accountant, "accountant");
        Assert.Equal(HttpStatusCode.Forbidden, (await accountant.GetAsync("/api/v1/users")).StatusCode);
        try
        {
            Assert.Equal(HttpStatusCode.NoContent, (await admin.PutAsJsonAsync("/api/v1/roles/NV_KTOAN/permissions", new { permissions = new[] { "users.manage" } })).StatusCode);
            Assert.Equal(HttpStatusCode.OK, (await accountant.GetAsync("/api/v1/users")).StatusCode);
        }
        finally { (await admin.PutAsJsonAsync("/api/v1/roles/NV_KTOAN/permissions", new { permissions = Array.Empty<string>() })).EnsureSuccessStatusCode(); }
        Assert.Equal(HttpStatusCode.Forbidden, (await accountant.GetAsync("/api/v1/users")).StatusCode);
    }
    [Fact]
    public async Task Cannot_remove_essential_admin_permissions()
    {
        using var admin = await factory.Client(); await Login(admin);
        Assert.Equal(HttpStatusCode.Conflict, (await admin.PutAsJsonAsync("/api/v1/roles/QTHT/permissions", new { permissions = Array.Empty<string>() })).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await admin.GetAsync("/api/v1/users")).StatusCode);
    }
    [Fact]
    public async Task Bcryptjs_and_dotnet_verify_each_others_hashes()
    {
        var root = new DirectoryInfo(AppContext.BaseDirectory);
        while (root is not null && !File.Exists(Path.Combine(root.FullName, "AGENTS.md"))) root = root.Parent;
        Assert.NotNull(root);
        var password = Convert.ToHexString(System.Security.Cryptography.RandomNumberGenerator.GetBytes(16)) + "aA@";
        var start = new System.Diagnostics.ProcessStartInfo(Environment.GetEnvironmentVariable("NODE_BINARY") ?? "node")
        { RedirectStandardInput = true, RedirectStandardOutput = true, RedirectStandardError = true, UseShellExecute = false, CreateNoWindow = true };
        start.ArgumentList.Add(Path.Combine(root!.FullName, "DB", "scripts", "bcrypt-interop.mjs"));
        using var process = System.Diagnostics.Process.Start(start)!;
        await process.StandardInput.WriteAsync(JsonSerializer.Serialize(new { password, dotnetHash = BCrypt.Net.BCrypt.HashPassword(password, 12) })); process.StandardInput.Close();
        var output = await process.StandardOutput.ReadToEndAsync(); await process.WaitForExitAsync();
        Assert.Equal(0, process.ExitCode);
        using var result = JsonDocument.Parse(output);
        Assert.True(result.RootElement.GetProperty("verified").GetBoolean());
        Assert.True(BCrypt.Net.BCrypt.Verify(password, result.RootElement.GetProperty("hash").GetString()));
    }
    [Fact]
    public async Task Resource_policy_requires_permission_scope_owner_assignee_and_state()
    {
        using var client = await factory.Client(); await Login(client, "staff");
        await using var scope = factory.Services.CreateAsyncScope();
        var auth = scope.ServiceProvider.GetRequiredService<IAuthorizationService>();
        var principal = new ClaimsPrincipal(new ClaimsIdentity([new("sub", factory.StaffId.ToString()), new("must_change_password", "false")], "resource-test"));
        var good = new ResourceAccess("contracts.create", true, factory.StaffId, factory.StaffId);
        Assert.True((await auth.AuthorizeAsync(principal, good, "ResourceAccess")).Succeeded);
        foreach (var denied in new[] { good with { InScope = false }, good with { OwnerId = Guid.NewGuid() }, good with { AssigneeId = Guid.NewGuid() }, good with { StateAllowsAction = false } })
            Assert.False((await auth.AuthorizeAsync(principal, denied, "ResourceAccess")).Succeeded);
    }
}
