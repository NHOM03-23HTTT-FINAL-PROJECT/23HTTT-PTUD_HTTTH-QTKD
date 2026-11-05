using System.Net.Http.Json;
using System.Text.Json;
using Xunit;

namespace QTKD.IntegrationTests;

public sealed class AuthOpenApiTests
{
    [Fact]
    public async Task Swagger_documents_auth_bearer_public_recovery_and_error_responses()
    {
        using var factory = new ApiFactory { EnvironmentName = "Development" };
        using var client = factory.CreateClient(new() { BaseAddress = new Uri("https://localhost:7156") });
        var document = await client.GetFromJsonAsync<JsonElement>("/openapi/v1.json");
        Assert.Contains("Swagger UI", await client.GetStringAsync("/swagger/index.html"));
        Assert.Equal("bearer", document.GetProperty("components").GetProperty("securitySchemes").GetProperty("Bearer").GetProperty("scheme").GetString());
        var paths = document.GetProperty("paths");
        var session = paths.GetProperty("/api/v1/auth/session").GetProperty("get");
        Assert.True(session.GetProperty("security")[0].TryGetProperty("Bearer", out _));
        var login = paths.GetProperty("/api/v1/auth/login").GetProperty("post");
        Assert.False(login.TryGetProperty("security", out _));
        Assert.Equal("X-QTKD-CSRF", login.GetProperty("parameters")[0].GetProperty("name").GetString());
        Assert.True(login.GetProperty("responses").TryGetProperty("423", out _));
        var send = paths.GetProperty("/api/v1/auth/password/recovery/send").GetProperty("post");
        Assert.False(send.TryGetProperty("security", out _));
        Assert.True(send.GetProperty("responses").TryGetProperty("202", out _));
        Assert.True(send.GetProperty("responses").TryGetProperty("429", out _));
        Assert.True(send.GetProperty("responses").TryGetProperty("503", out _));
    }
}
