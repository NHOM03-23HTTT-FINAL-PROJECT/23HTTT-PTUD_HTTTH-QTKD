using System.Security.Cryptography;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Npgsql;
using Npgsql.NameTranslation;
using QTKD.Api.Authorization;
using QTKD.Application.Features.ContractApprovals;
using QTKD.Domain.Identity;
using QTKD.Infrastructure.Persistence;

namespace QTKD.IntegrationTests;

// No replacement authentication handler: hashing, Identity Core, JWT bearer and policies are real.
// SQLite supplies offline API checks only. The same suite can target an explicitly disposable Supabase DB.
public sealed class ApiFactory : WebApplicationFactory<Program>
{
    public IContractApprovalEngine? ApprovalEngine { get; init; }
    public IApprovalStore? ApprovalStore { get; init; }
    private readonly SqliteConnection sqlite = new("Data Source=:memory:");
    public readonly string Key = Convert.ToBase64String(RandomNumberGenerator.GetBytes(48));
    public readonly string Password = "Identity.Test@2026";
    public readonly Guid AdminId = Guid.NewGuid();
    public readonly Guid AccountantId = Guid.NewGuid();
    public readonly Guid StaffId = Guid.NewGuid();
    public readonly Guid TemporaryId = Guid.NewGuid();
    public readonly string Prefix = "test." + Guid.NewGuid().ToString("N")[..12];
    public Guid SalesDepartment { get; private set; }
    private bool seeded;
    public bool PostgreSql { get; private set; }

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Testing");
        builder.ConfigureAppConfiguration((_, config) => config.AddInMemoryCollection(new Dictionary<string, string?>
        { ["Jwt:SigningKey"] = Key, ["Jwt:Issuer"] = "qtkd-api", ["Jwt:Audience"] = "qtkd-web", ["ConnectionStrings:Identity"] = "test-context-replaced-by-factory" }));
        builder.ConfigureTestServices(services =>
        {
            if (ApprovalStore is not null)
            {
                services.RemoveAll<IApprovalStore>();
                services.AddSingleton(ApprovalStore);
            }
            if (ApprovalEngine is not null)
            {
                services.RemoveAll<IContractApprovalEngine>();
                services.AddSingleton(ApprovalEngine);
            }
            services.RemoveAll<IdentityDbContext>();
            services.RemoveAll<DbContextOptions<IdentityDbContext>>();
            services.RemoveAll<IDbContextOptionsConfiguration<IdentityDbContext>>();
            var connection = Environment.GetEnvironmentVariable("QTKD_TEST_DATABASE_CONNECTION");
            if (!string.IsNullOrWhiteSpace(connection))
            {
                // No shared/production DB, automatic migration, schema deletion or fallback to app configuration.
                if (Environment.GetEnvironmentVariable("QTKD_TEST_DATABASE_IS_DISPOSABLE") != "true") throw new InvalidOperationException("Explicit disposable test database acknowledgement is required.");
                var parsed = new NpgsqlConnectionStringBuilder(connection);
                if (!(parsed.Host.EndsWith("supabase.co") || parsed.Host.EndsWith("supabase.com")) || parsed.Port != 5432 || parsed.SslMode < SslMode.Require)
                    throw new InvalidOperationException("A dedicated Supabase direct/session test connection with TLS is required.");
                PostgreSql = true;
                services.AddDbContext<IdentityDbContext>(options => options.UseNpgsql(connection, pg =>
                { var names = new NpgsqlNullNameTranslator(); pg.MapEnum<UserRole>("user_role", "qtkd", names); pg.MapEnum<UserStatus>("user_status", "qtkd", names); pg.MapEnum<SessionEndReason>("session_end_reason", "qtkd", names); }));
            }
            else
            {
                sqlite.Open(); services.AddDbContext<IdentityDbContext>(options => options.UseSqlite(sqlite));
            }
        });
    }
    public async Task<HttpClient> Client()
    {
        var client = CreateClient(new WebApplicationFactoryClientOptions { BaseAddress = new Uri("https://localhost:7156"), AllowAutoRedirect = false });
        client.DefaultRequestHeaders.Add("Origin", "https://localhost:7156");
        client.DefaultRequestHeaders.Add("X-QTKD-CSRF", "1");
        if (!seeded)
        {
            await using var scope = Services.CreateAsyncScope(); var db = scope.ServiceProvider.GetRequiredService<IdentityDbContext>();
            if (!PostgreSql)
            {
                await db.Database.EnsureCreatedAsync();
                var departmentCodes = new[] { "KD", "KT", "KTOAN", "PC", "BGD", "QTHT" };
                db.Departments.AddRange(departmentCodes.Select(code => new Department { Code = code, DepartmentName = code }));
                db.Roles.AddRange(Enum.GetValues<UserRole>().Select(role => new RoleDefinition { Code = role, Name = role.ToString(), DepartmentCode = role switch
                { UserRole.SalesStaff or UserRole.SalesManager => "KD", UserRole.OperationsStaff or UserRole.OperationsManager => "KT", UserRole.Accountant => "KTOAN", UserRole.LegalStaff => "PC", UserRole.BoardMember => "BGD", _ => "QTHT" } }));
                db.Permissions.AddRange(PermissionCatalog.Codes.Select(code => new Permission { Code = code, Name = code }));
                db.Grants.AddRange(new[] { "users.manage", "roles.manage", "departments.manage" }.Select(code => new RolePermission { Role = UserRole.SystemAdmin, PermissionCode = code }));
                db.Grants.Add(new RolePermission { Role = UserRole.SalesStaff, PermissionCode = "contracts.create" });
                await db.SaveChangesAsync();
            }
            else if (await db.Roles.CountAsync() != 8) throw new InvalidOperationException("Apply Prisma migrations to the dedicated test DB first.");
            var departments = await db.Departments.ToDictionaryAsync(x => x.Code, x => x.DepartmentId);
            SalesDepartment = departments["KD"];
            string hash = BCrypt.Net.BCrypt.HashPassword(Password, 12);
            db.Users.AddRange(
                new UserAccount { UserId = AdminId, Username = Prefix + ".admin", CompanyEmail = Prefix + ".admin@example.invalid", FullName = "Admin Test", DepartmentId = departments["QTHT"], Role = UserRole.SystemAdmin, PasswordHash = hash, MustChangePassword = false },
                new UserAccount { UserId = AccountantId, Username = Prefix + ".accountant", CompanyEmail = Prefix + ".accountant@example.invalid", FullName = "Accountant Test", DepartmentId = departments["KTOAN"], Role = UserRole.Accountant, PasswordHash = hash, MustChangePassword = false },
                new UserAccount { UserId = StaffId, Username = Prefix + ".staff", CompanyEmail = Prefix + ".staff@example.invalid", FullName = "Staff Test", DepartmentId = departments["KD"], Role = UserRole.SalesStaff, PasswordHash = hash, MustChangePassword = false },
                new UserAccount { UserId = TemporaryId, Username = Prefix + ".temporary", CompanyEmail = Prefix + ".temporary@example.invalid", FullName = "Temporary Test", DepartmentId = departments["KD"], Role = UserRole.SalesStaff, PasswordHash = hash, MustChangePassword = true });
            await db.SaveChangesAsync(); seeded = true;
        }
        return client;
    }
    protected override void Dispose(bool disposing)
    {
        if (disposing && seeded && PostgreSql)
        {
            using var scope = Services.CreateScope(); var db = scope.ServiceProvider.GetRequiredService<IdentityDbContext>();
            // Only this factory's synthetic rows, after explicit test-project acknowledgement.
            var ids = db.Users.Where(x => x.Username.StartsWith(Prefix + ".")).Select(x => x.UserId).ToArray();
            db.Sessions.Where(x => ids.Contains(x.UserId)).ExecuteDelete();
            db.Users.Where(x => ids.Contains(x.UserId)).ExecuteDelete();
        }
        base.Dispose(disposing); if (disposing) sqlite.Dispose();
    }
}
