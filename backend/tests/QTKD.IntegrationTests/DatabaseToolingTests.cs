using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Metadata;
using Npgsql;
using QTKD.Infrastructure.Persistence;
using QTKD.Infrastructure.Persistence.Migrations;
using QTKD.Infrastructure.Persistence.Seed;
using QTKD.Infrastructure.Persistence.Tooling;
using Xunit;

namespace QTKD.IntegrationTests;

// Offline checks of the EF-owned schema tooling (ported from DB/tests/*.test.ts when Prisma was removed).
// No connection is opened. PostgreSQL execution is covered by DB/tests/dbtool-pglite.mjs and ef-schema-parity.mjs.
public sealed class DatabaseToolingTests
{
    private static readonly IModel Model = DesignModel();
    private static readonly string Repo = FindRepo();

    private static IModel DesignModel()
    {
        using var db = new QtkdDbContext(QtkdPersistence.Options("Host=offline.invalid"));
        return db.GetService<IDesignTimeModel>().Model;
    }

    private static string FindRepo()
    {
        for (var dir = new DirectoryInfo(AppContext.BaseDirectory); dir is not null; dir = dir.Parent)
            if (Directory.Exists(Path.Combine(dir.FullName, "DB", "data-dictionary"))) return dir.FullName;
        throw new InvalidOperationException("Repository root not found.");
    }

    private static DemoSeedData Fixture() => DemoSeedData.Load();
    private static string Id(DemoSeedData data, string name) => data.Id(name).ToString();
    private static void Rejects(DemoSeedData data, string pattern) =>
        Assert.Matches(pattern, Assert.Throws<InvalidOperationException>(() => DemoSeedValidator.Validate(data, Model)).Message);

    [Fact]
    public void Valid_complete_fixture_passes_without_any_connection()
    {
        var counts = DemoSeedValidator.Validate(Fixture(), Model);
        Assert.Equal(29, counts.Count);
        Assert.Equal(11, counts["user_account"]);
        Assert.Equal(6, counts["department"]);
    }

    [Fact]
    public void Missing_foreign_key_and_duplicate_account_are_rejected()
    {
        var data = Fixture();
        data.Rows("customer")[0]["account_manager_id"] = Guid.NewGuid().ToString();
        Rejects(data, "Broken FK");
        var duplicate = Fixture();
        duplicate.Rows("user_account")[1]["username"] = duplicate.Rows("user_account")[0]["username"]!.GetValue<string>();
        Rejects(duplicate, "Duplicate key");
    }

    [Fact]
    public void Invalid_tax_code_and_empty_customer_contact_are_rejected()
    {
        var data = Fixture();
        data.Rows("customer")[0]["tax_code"] = "123";
        Rejects(data, "tax code");
        var contact = Fixture();
        contact.Rows("customer")[0]["phone"] = "";
        contact.Rows("customer")[0]["email"] = "";
        Rejects(contact, "customer contact");
    }

    [Fact]
    public void Area_cycles_excess_depth_and_stale_hierarchy_path_are_rejected()
    {
        var cycle = Fixture();
        cycle.Rows("area")[1]["parent_area_id"] = Id(cycle, "block");
        Rejects(cycle, "cycle");
        var deep = Fixture();
        var child = deep.Rows("area").Single(a => a["area_id"]!.GetValue<string>() == Id(deep, "suspendedBlock"));
        child["parent_area_id"] = Id(deep, "block");
        child["level"] = 4;
        Rejects(deep, "depth");
        var path = Fixture();
        path.Rows("area")[1]["hierarchy_path"] = "/wrong";
        Rejects(path, "hierarchy path");
    }

    [Fact]
    public void Line_arithmetic_totals_and_source_contract_must_match()
    {
        var line = Fixture();
        line.Rows("payment_statement_line")[0]["amount"] = "1.00";
        Rejects(line, "line amount");
        var total = Fixture();
        total.Rows("payment_statement")[0]["total_amount"] = "1.00";
        Rejects(total, "payment total");
        var volume = Fixture();
        volume.Rows("volume_period")[0]["contract_id"] = Id(volume, "draftContract");
        Rejects(volume, "volume contract");
    }

    [Fact]
    public void Duplicate_running_round_and_wrong_decision_actor_are_rejected()
    {
        var data = Fixture();
        var current = data.Rows("approval_round").First(r => (r["result"]?.GetValue<string>() ?? "Running") == "Running");
        var round = current.DeepClone().AsObject();
        round["round_id"] = "00000000-0000-4000-8000-000000009999";
        round["round_no"] = 2;
        data.Rows("approval_round").Add(round);
        var step = data.Rows("approval_step").First(s => s["round_id"]!.GetValue<string>() == current["round_id"]!.GetValue<string>())
            .DeepClone().AsObject();
        step["round_id"] = "00000000-0000-4000-8000-000000009999";
        step["step_id"] = "00000000-0000-4000-8000-000000009998";
        data.Rows("approval_step").Add(step);
        Rejects(data, "Duplicate running");
        var actor = Fixture();
        actor.Rows("approval_step").First(s => s["decided_by"] is not null)["decided_by"] = Id(actor, "admin");
        Rejects(actor, "not assignee");
    }

    [Fact]
    public void Unrevoked_sessions_unused_otp_unauthorized_signer_and_role_department_mismatch_are_rejected()
    {
        var session = Fixture();
        session.Rows("login_session")[0]["is_revoked"] = false;
        Rejects(session, "live sessions");
        var otp = Fixture();
        otp.Rows("password_otp")[0]["is_used"] = false;
        Rejects(otp, "usable OTP");
        var signer = Fixture();
        signer.Rows("user_account").Single(u => u["user_id"]!.GetValue<string>() == Id(signer, "boardMember"))["can_sign"] = false;
        Rejects(signer, "signing authority");
        var department = Fixture();
        department.Rows("user_account")[0]["department_id"] = Id(department, "accounting");
        Rejects(department, "role/department");
    }

    [Fact]
    public void Password_placeholder_is_replaced_without_changing_the_embedded_fixture()
    {
        var seeded = Fixture().WithPasswordHash("$2a$12$hash");
        Assert.All(seeded.Rows("user_account"), u => Assert.Equal("$2a$12$hash", u["password_hash"]!.GetValue<string>()));
        Assert.All(Fixture().Rows("user_account"), u => Assert.Equal("__SEED_PASSWORD_HASH__", u["password_hash"]!.GetValue<string>()));
    }

    [Fact]
    public void Identity_catalog_ten_roles_zero_accountant_grants_and_admin_capabilities()
    {
        var data = Fixture();
        Assert.Equal(10, data.Rows("role_definition").Count);
        var grants = data.Rows("role_permission");
        var permissions = data.Rows("permission").Select(p => p["code"]!.GetValue<string>()).ToHashSet();
        Assert.All(grants, g => Assert.Contains(g["permission_code"]!.GetValue<string>(), permissions));
        Assert.DoesNotContain(grants, g => g["role"]!.GetValue<string>() == "Accountant");
        foreach (var code in new[] { "users.manage", "roles.manage", "departments.manage" })
            Assert.Contains(grants, g => g["role"]!.GetValue<string>() == "SystemAdmin" && g["permission_code"]!.GetValue<string>() == code);
    }

    [Fact]
    public void Migration_sql_bootstraps_the_same_grants_as_the_fixture()
    {
        // Grants bootstrapped by 0003 plus grants added later in the same `SELECT 'Role', unnest(ARRAY[...])` form.
        var sql = MigrationSql.Read("202611020003_identity") + "\n" + MigrationSql.Read("202611030004_approval_assignment");
        var data = Fixture();
        foreach (var role in data.Rows("role_definition").Select(r => r["code"]!.GetValue<string>()))
        {
            var fromSql = Regex.Matches(sql, $@"SELECT '{role}', unnest\(ARRAY\[([^\]]*)\]")
                .SelectMany(m => Regex.Matches(m.Groups[1].Value, "'([^']+)'").Select(v => v.Groups[1].Value)).Order().ToList();
            var fromFixture = data.Rows("role_permission").Where(g => g["role"]!.GetValue<string>() == role)
                .Select(g => g["permission_code"]!.GetValue<string>()).Order().ToList();
            Assert.Equal(fromFixture, fromSql);
        }
    }

    [Fact]
    public void Dictionary_tables_and_239_columns_are_mapped_with_documented_additions()
    {
        var source = JsonNode.Parse(File.ReadAllText(Path.Combine(Repo, "DB", "data-dictionary", "source-columns.json")))!;
        var tables = source["tables"]!.AsObject().ToDictionary(t => t.Key, t => t.Value!.AsArray().Select(c => c!.GetValue<string>()).ToList());
        var entities = Model.GetEntityTypes().ToDictionary(e => e.GetTableName()!);
        Assert.Equal(239, tables.Values.Sum(c => c.Count));
        Assert.Equal(["contract_cancellation_request", "contract_delivery", "idempotency_request", "permission", "role_definition", "role_permission"],
            entities.Keys.Where(t => !tables.ContainsKey(t)).Order().ToArray());
        var additions = new Dictionary<string, string[]>
        {
            ["department"] = ["code"],
            ["user_account"] = ["password_changed_at"],
            ["login_session"] = ["last_activity_at", "logout_token_hash", "remember", "revocation_reason"],
            ["attachment"] = ["content_type", "file_size"],
            ["customer"] = ["customer_code"],
            ["service"] = ["requires_area", "service_code"],
            ["contract"] = ["cancellation_reason", "cancelled_at", "cancelled_by", "contract_code", "customer_snapshot",
                "owning_department_id", "source_mode", "template_code", "updated_at"],
        };
        foreach (var (table, columns) in tables)
        {
            var actual = entities[table].GetProperties().Select(p => p.GetColumnName()).ToList();
            Assert.All(columns, c => Assert.Contains(c, actual));
            Assert.Equal(additions.GetValueOrDefault(table, []), actual.Except(columns).Order().ToArray());
        }
        // Dictionary FKs; user_account.role → role_definition and the two raw-SQL contract FKs came later.
        var later = new HashSet<string> { "user_account.role", "contract.owning_department_id", "contract.cancelled_by" };
        var fks = source["foreignKeys"]!.AsArray().Select(f => $"{f!["table"]}.{f["column"]}->{f["target"]}").Order().ToArray();
        var actualFks = entities.Where(e => tables.ContainsKey(e.Key)).SelectMany(e => e.Value.GetForeignKeys()
                .Select(fk => (Column: $"{e.Key}.{fk.Properties[0].GetColumnName()}", Target: fk.PrincipalEntityType.GetTableName())))
            .Where(fk => !later.Contains(fk.Column)).Select(fk => $"{fk.Column}->{fk.Target}").Order().ToArray();
        Assert.Equal(fks, actualFks);
    }

    [Fact]
    public void Migration_sql_resources_are_complete_ordered_and_without_their_own_transactions()
    {
        var names = MigrationSql.Names();
        Assert.Equal(MigrationSql.PrismaBaseline.Select(m => m.PrismaName), names.Take(MigrationSql.PrismaBaseline.Count));
        Assert.Equal(MigrationSql.PrismaBaseline.Select(m => m.EfId), MigrationSql.PrismaBaseline.Select(m => m.EfId).Order(StringComparer.Ordinal));
        foreach (var name in names)
            Assert.DoesNotMatch(@"(?m)^\s*(BEGIN|COMMIT);\s*$", MigrationSql.Read(name));
        using var db = new QtkdDbContext(QtkdPersistence.Options("Host=offline.invalid"));
        var ids = db.Database.GetMigrations().ToList();
        Assert.Equal(MigrationSql.PrismaBaseline.Select(m => m.EfId), ids.Take(MigrationSql.PrismaBaseline.Count));
        Assert.Equal(names.Count, ids.Count);
    }

    [Fact]
    public void Connection_guard_permits_supabase_direct_and_session_urls_only_without_revealing_secrets()
    {
        const string secret = "private-example-password";
        var direct = $"postgresql://postgres:{secret}@db.abcdefghijkl.supabase.co:5432/postgres?schema=qtkd&sslmode=require";
        var session = $"postgresql://postgres.abcdefghijkl:{secret}@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres?schema=qtkd&sslmode=verify-full&sslrootcert=./ca.crt";
        var d = DatabaseUrl.Require(direct);
        Assert.Equal(("db.abcdefghijkl.supabase.co", 5432, "postgres", secret, "qtkd", SslMode.Require), (d.Host, d.Port, d.Username, d.Password, d.SearchPath, d.SslMode));
        var s = DatabaseUrl.Require(session, baseDirectory: Path.GetTempPath());
        Assert.Equal(("postgres.abcdefghijkl", SslMode.VerifyFull, Path.Combine(Path.GetTempPath(), "ca.crt")), (s.Username, s.SslMode, s.RootCertificate));
        foreach (var value in new[] { "", "not-a-url", direct.Replace("db.abcdefghijkl.supabase.co", "localhost"), session.Replace(":5432", ":6543"),
                     direct.Replace("schema=qtkd", "schema=public"), direct.Replace("&sslmode=require", "") })
        {
            var error = Assert.Throws<InvalidOperationException>(() => DatabaseUrl.Require(value));
            Assert.DoesNotContain(secret, error.Message);
        }
        var local = DatabaseUrl.Require("postgresql://postgres@127.0.0.1:55432/postgres?schema=qtkd&sslmode=disable", allowDisposableLocal: true);
        Assert.Equal((55432, SslMode.Disable, false), (local.Port, local.SslMode, local.Pooling));
    }

    [Fact]
    public void Connection_failures_are_explained_without_raw_messages()
    {
        const string secret = "host-and-password-secret";
        Assert.StartsWith("FAIL [TLS]", ConnectionDiagnostics.Describe(new NpgsqlException(secret, new System.Security.Authentication.AuthenticationException(secret))));
        Assert.StartsWith("FAIL [ENOTFOUND]", ConnectionDiagnostics.Describe(
            new AggregateException(new System.Net.Sockets.SocketException((int)System.Net.Sockets.SocketError.HostNotFound))));
        Assert.StartsWith("FAIL [ETIMEDOUT]", ConnectionDiagnostics.Describe(new NpgsqlException(secret, new TimeoutException(secret))));
        var unknown = ConnectionDiagnostics.Describe(new InvalidOperationException(secret, new Exception(secret)));
        Assert.StartsWith("FAIL [UNKNOWN]", unknown);
        Assert.DoesNotContain(secret, unknown);
    }
}
