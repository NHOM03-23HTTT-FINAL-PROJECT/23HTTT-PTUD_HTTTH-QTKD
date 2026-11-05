using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using System.Threading.Channels;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using QTKD.Infrastructure.Identity;
using QTKD.Infrastructure.Persistence;
using Xunit;

namespace QTKD.IntegrationTests;

public sealed class PasswordRecoveryApiTests : IDisposable
{
    private const string Auth = "/api/v1/auth";
    private const string Recovery = Auth + "/password/recovery";
    private const string NewPassword = "Recovery.Test@2026";
    private readonly Inbox inbox = new();
    private readonly RecoveryClock clock = new();
    private readonly ApiFactory factory;

    public PasswordRecoveryApiTests() => factory = new() { RecoveryMail = inbox, Clock = clock };

    [Fact]
    public async Task Reset_uses_otp_and_reset_token_once_and_revokes_every_existing_session()
    {
        using var first = await factory.Client();
        using var second = await factory.Client();
        using var anonymous = await factory.Client();
        await Login(first, factory.Password);
        await Login(second, factory.Password);

        var code = await RequestCode(anonymous);
        var token = await GetResetToken(anonymous, code);
        await AssertError(await Verify(anonymous, code), "INVALID_CODE");
        await AssertError(await Reset(anonymous, token, "weak"), "WEAK_PASSWORD");
        await AssertError(await Reset(anonymous, token, factory.Password), "SAME_AS_CURRENT");

        using var reset = await Reset(anonymous, token, NewPassword);
        reset.EnsureSuccessStatusCode();
        Assert.Equal(Identifier, (await Body(reset)).GetProperty("identifier").GetString());
        Assert.False(reset.Headers.Contains("Set-Cookie"));
        await AssertError(await Reset(anonymous, token, "Another.Test@2026"), "TOKEN_EXPIRED");

        foreach (var device in new[] { first, second })
        {
            Assert.Equal(HttpStatusCode.Unauthorized, (await device.GetAsync(Auth + "/session")).StatusCode);
            Assert.Equal(HttpStatusCode.Unauthorized, (await device.PostAsJsonAsync(Auth + "/refresh", new { })).StatusCode);
        }
        using var oldLogin = await anonymous.PostAsJsonAsync(Auth + "/login", new { identifier = Identifier, password = factory.Password });
        Assert.Equal(HttpStatusCode.Unauthorized, oldLogin.StatusCode);
        await Login(anonymous, NewPassword);
        Assert.Equal(HttpStatusCode.OK, (await anonymous.GetAsync(Auth + "/session")).StatusCode);
    }

    [Fact]
    public async Task Rejects_expired_otp_and_expired_reset_token()
    {
        using var client = await factory.Client();
        var code = await RequestCode(client);
        clock.Advance(TimeSpan.FromMinutes(5));
        await AssertError(await Verify(client, code), "INVALID_CODE");

        var token = await GetResetToken(client, await RequestCode(client));
        clock.Advance(TimeSpan.FromMinutes(10));
        await AssertError(await Reset(client, token, NewPassword), "TOKEN_EXPIRED");
    }

    [Fact]
    public async Task Five_incorrect_codes_disable_the_current_code_without_locking_login()
    {
        using var client = await factory.Client();
        var code = await RequestCode(client);
        clock.Advance(TimeSpan.FromMinutes(4));
        for (var attempt = 0; attempt < 5; attempt++)
            await AssertError(await Verify(client, code == "000000" ? "111111" : "000000"), "INVALID_CODE");
        await AssertError(await Verify(client, code), "INVALID_CODE");

        await using var scope = factory.Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<IdentityDbContext>();
        var stored = await db.PasswordOtps.AsNoTracking().SingleAsync(x => x.UserId == factory.StaffId);
        Assert.Equal(5, stored.FailedCount);
        Assert.True(stored.IsUsed);
        Assert.Equal("", stored.OtpHash);
        Assert.Equal(clock.GetUtcNow().UtcDateTime.AddMinutes(15), stored.ExpiresAt);
        await Login(client, factory.Password);
    }

    [Fact]
    public async Task Send_is_indistinguishable_for_unknown_accounts_and_recovery_is_rate_limited()
    {
        using var client = await factory.Client();
        using var unknown = await client.PostAsJsonAsync(Recovery + "/send", new { identifier = factory.Prefix + ".missing" });
        using var known = await client.PostAsJsonAsync(Recovery + "/send", new { identifier = Identifier });
        Assert.Equal(HttpStatusCode.Accepted, known.StatusCode);
        Assert.Equal(known.StatusCode, unknown.StatusCode);
        Assert.Equal((await Body(known)).GetRawText(), (await Body(unknown)).GetRawText());
        Assert.Equal(Identifier + "@example.invalid", (await inbox.Next()).Recipient);

        for (var attempt = 0; attempt < 18; attempt++)
            await AssertError(await Verify(client, "x"), "INVALID_CODE");
        using var limited = await Verify(client, "x");
        Assert.Equal(HttpStatusCode.TooManyRequests, limited.StatusCode);
        Assert.Equal("RATE_LIMITED", (await Body(limited)).GetProperty("code").GetString());
        await Login(client, factory.Password);
    }

    private string Identifier => factory.Prefix + ".staff";

    private async Task<string> RequestCode(HttpClient client)
    {
        using var response = await client.PostAsJsonAsync(Recovery + "/send", new { identifier = Identifier });
        Assert.Equal(HttpStatusCode.Accepted, response.StatusCode);
        Assert.False((await Body(response)).TryGetProperty("devCode", out _));
        var (recipient, code) = await inbox.Next();
        Assert.Equal(Identifier + "@example.invalid", recipient);
        Assert.Matches("^[0-9]{6}$", code);
        return code;
    }

    private Task<HttpResponseMessage> Verify(HttpClient client, string code) =>
        client.PostAsJsonAsync(Recovery + "/verify", new { identifier = Identifier, code });

    private async Task<string?> GetResetToken(HttpClient client, string code)
    {
        using var response = await Verify(client, code);
        response.EnsureSuccessStatusCode();
        return (await Body(response)).GetProperty("resetToken").GetString();
    }

    private static Task<HttpResponseMessage> Reset(HttpClient client, string? token, string password) =>
        client.PostAsJsonAsync(Recovery + "/reset", new { resetToken = token, newPassword = password });

    private async Task Login(HttpClient client, string password)
    {
        using var response = await client.PostAsJsonAsync(Auth + "/login", new { identifier = Identifier, password });
        response.EnsureSuccessStatusCode();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", (await Body(response)).GetProperty("accessToken").GetString());
    }

    private static Task<JsonElement> Body(HttpResponseMessage response) => response.Content.ReadFromJsonAsync<JsonElement>();

    private static async Task AssertError(HttpResponseMessage response, string code)
    {
        using (response)
        {
            Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
            Assert.Equal(code, (await Body(response)).GetProperty("code").GetString());
        }
    }

    public void Dispose() => factory.Dispose();

    private sealed class Inbox : IPasswordRecoveryMailSender
    {
        private readonly Channel<(string Recipient, string Code)> messages = Channel.CreateUnbounded<(string, string)>();

        public Task Send(string recipient, string code, CancellationToken ct) => messages.Writer.WriteAsync((recipient, code), ct).AsTask();

        public async Task<(string Recipient, string Code)> Next()
        {
            using var deadline = new CancellationTokenSource(TimeSpan.FromSeconds(10));
            return await messages.Reader.ReadAsync(deadline.Token);
        }
    }

    private sealed class RecoveryClock : TimeProvider
    {
        private readonly DateTimeOffset start = DateTimeOffset.FromUnixTimeMilliseconds(DateTimeOffset.UtcNow.ToUnixTimeMilliseconds());
        private long elapsed;

        public override DateTimeOffset GetUtcNow() => start.AddTicks(Interlocked.Read(ref elapsed));
        public void Advance(TimeSpan duration) => Interlocked.Add(ref elapsed, duration.Ticks);
    }
}
