using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Xunit;

namespace QTKD.IntegrationTests;

public sealed class ApprovalAssignmentApiTests : IDisposable
{
    private readonly ApiFactory factory = new();
    public void Dispose() => factory.Dispose();

    [Fact]
    public async Task Anonymous_is_401_and_user_without_approvals_assign_is_403()
    {
        var client = await factory.Client();
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/v1/approvals/assignments")).StatusCode);

        var login = await client.PostAsJsonAsync("/api/v1/auth/login", new { identifier = factory.Prefix + ".staff", password = factory.Password });
        login.EnsureSuccessStatusCode();
        var auth = await login.Content.ReadFromJsonAsync<JsonElement>();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", auth.GetProperty("accessToken").GetString());

        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync("/api/v1/approvals/assignments")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync($"/api/v1/approvals/contracts/{Guid.NewGuid()}/candidates?step=legal")).StatusCode);
        var assign = await client.PostAsJsonAsync($"/api/v1/approvals/contracts/{Guid.NewGuid()}/assignment",
            new { roundId = Guid.NewGuid(), stepId = Guid.NewGuid(), viewedVersion = 1, assigneeId = Guid.NewGuid() });
        Assert.Equal(HttpStatusCode.Forbidden, assign.StatusCode);
    }
}
