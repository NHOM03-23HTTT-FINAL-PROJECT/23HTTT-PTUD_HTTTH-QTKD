using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using QTKD.Application.Features.Contracts;
using QTKD.Domain.Identity;
using QTKD.Infrastructure.Persistence;
using Xunit;

namespace QTKD.IntegrationTests;

public class ContractCsrfApiTests
{
    [Fact]
    public async Task Contract_writes_reject_missing_csrf_or_untrusted_origin_before_accessing_contract_data()
    {
        using var factory = new ApiFactory();
        using var seedClient = await factory.Client();
        await using (var scope = factory.Services.CreateAsyncScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<IdentityDbContext>();
            foreach (var permission in new[] { "contracts.view", "approvals.approve", "customers.view" })
            {
                if (!await db.Grants.AnyAsync(g => g.Role == UserRole.SalesStaff && g.PermissionCode == permission))
                    db.Grants.Add(new RolePermission { Role = UserRole.SalesStaff, PermissionCode = permission });
            }
            await db.SaveChangesAsync();
        }
        var login = await seedClient.PostAsJsonAsync("/api/v1/auth/login", new { identifier = factory.Prefix + ".staff", password = factory.Password });
        login.EnsureSuccessStatusCode();
        var auth = await login.Content.ReadFromJsonAsync<JsonElement>();
        // CSRF must reject before any service operation; avoid constructing the production PostgreSQL repositories.
        using var host = factory.WithWebHostBuilder(builder => builder.ConfigureTestServices(services =>
            services.AddScoped<ContractService>(_ => new ContractService(null!, null!))));
        using var client = host.CreateClient(new WebApplicationFactoryClientOptions { BaseAddress = new Uri("https://localhost:7156") });
        client.DefaultRequestHeaders.Add("Origin", "https://localhost:7156");
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", auth.GetProperty("accessToken").GetString());

        var endpoints = new[]
        {
            (HttpMethod.Post, "/api/v1/contracts"),
            (HttpMethod.Put, "/api/v1/contracts/HD-1"),
            (HttpMethod.Post, "/api/v1/contracts/HD-1/cancel"),
            (HttpMethod.Post, "/api/v1/contracts/HD-1/cancellation-requests"),
            (HttpMethod.Post, $"/api/v1/contracts/HD-1/cancellation-requests/{Guid.NewGuid()}/decision"),
            (HttpMethod.Post, "/api/v1/contracts/HD-1/attachments"),
            (HttpMethod.Delete, $"/api/v1/contracts/HD-1/attachments/{Guid.NewGuid()}?baseVersion=1")
        };
        foreach (var invalidOrigin in new[] { false, true })
        {
            client.DefaultRequestHeaders.Remove("X-QTKD-CSRF");
            if (invalidOrigin)
            {
                client.DefaultRequestHeaders.Add("X-QTKD-CSRF", "1");
                client.DefaultRequestHeaders.Remove("Origin");
                client.DefaultRequestHeaders.Add("Origin", "https://untrusted.example.invalid");
            }
            foreach (var (method, path) in endpoints)
            {
                using var request = new HttpRequestMessage(method, path);
                if (method != HttpMethod.Delete)
                {
                    if (path.EndsWith("/attachments"))
                    {
                        var form = new MultipartFormDataContent();
                        form.Add(new ByteArrayContent([1, 2, 3]), "file", "contract.pdf");
                        form.Add(new StringContent("1"), "baseVersion");
                        request.Content = form;
                    }
                    else
                    {
                        request.Content = new StringContent("{}", Encoding.UTF8, "application/json");
                    }
                }
                using var response = await client.SendAsync(request);
                Assert.Equal(403, (int)response.StatusCode);
                Assert.Equal("CSRF_REJECTED", (await response.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("code").GetString());
            }
        }
    }
}
