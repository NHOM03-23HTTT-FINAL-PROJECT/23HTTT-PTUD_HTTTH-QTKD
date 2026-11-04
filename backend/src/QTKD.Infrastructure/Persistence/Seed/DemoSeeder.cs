using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Metadata;
using Npgsql;
using NpgsqlTypes;

namespace QTKD.Infrastructure.Persistence.Seed;

/// <summary>
/// Idempotent demo seed in one transaction (port of DB/prisma/seed.ts). Existing rows are kept: no cleanup, password
/// reset or destructive reset. Initial role grants come from migration 202611020003; removed grants are never restored.
/// </summary>
public static partial class DemoSeeder
{
    /// <summary>Insert order. Parents precede children; rows are inserted one statement at a time.</summary>
    public static readonly IReadOnlyList<string> Order =
    [
        "role_definition", "permission", "department", "user_account", "service", "area", "customer",
        "customer_status_decision", "contract", "area_service", "area_assignment", "contract_item", "price_list",
        "price_list_line", "volume_period", "volume_line", "payment_statement", "payment_statement_line", "reconciliation",
        "change_request", "approval_round", "approval_step", "attachment", "signing_session", "notification",
        "login_session", "password_otp", "audit_log",
    ];

    public static async Task SeedAsync(QtkdDbContext db, DemoSeedData data, CancellationToken ct)
    {
        var model = db.GetService<IDesignTimeModel>().Model;
        DemoSeedValidator.Validate(data, model);
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        // Serialize concurrent seed invocations.
        await db.Database.ExecuteSqlRawAsync("SELECT pg_advisory_xact_lock(hashtextextended('qtkd-demo-seed-v1', 0))", ct);

        foreach (var table in Order)
        {
            foreach (var source in data.Rows(table))
            {
                var row = source.DeepClone().AsObject();
                // Department managers are users inserted afterwards; set below, only where still empty.
                if (table == "department") row.Remove("manager_id");
                await Insert(db, table, row, ct);
            }
            if (table == "user_account") await SetManagers(db, data, ct);
        }

        // A collision on username/email/natural keys must fail rather than silently leave a partial fixture.
        foreach (var (table, rows) in data.Tables)
        {
            var key = model.GetEntityTypes().Single(e => e.GetTableName() == table).FindPrimaryKey()!.Properties;
            if (key.Count != 1 || rows.Count == 0) continue; // composite keys (area_service, role_permission) are covered by FKs
            var column = Identifier(key[0].GetColumnName());
            var ids = rows.Select(r => DemoSeedValidator.S(r, key[0].GetColumnName())!).ToArray();
            var found = await db.Database.SqlQueryRaw<long>(
                $"SELECT count(*) AS \"Value\" FROM qtkd.\"{Identifier(table)}\" WHERE \"{column}\"::text = ANY(@ids)",
                new NpgsqlParameter("ids", ids)).SingleAsync(ct);
            if (found != ids.Length) throw new InvalidOperationException($"Seed ID collision: {table}");
        }
        await tx.CommitAsync(ct);
    }

    private static Task Insert(QtkdDbContext db, string table, JsonObject row, CancellationToken ct)
    {
        // jsonb_populate_record lets PostgreSQL convert every value to the column's own type (enum, uuid, numeric, date...).
        var columns = string.Join(", ", row.Select(p => $"\"{Identifier(p.Key)}\""));
        var sql = $"INSERT INTO qtkd.\"{Identifier(table)}\" ({columns}) " +
                  $"SELECT {columns} FROM jsonb_populate_record(NULL::qtkd.\"{Identifier(table)}\", @row) ON CONFLICT DO NOTHING";
        return db.Database.ExecuteSqlRawAsync(sql, [new NpgsqlParameter("row", NpgsqlDbType.Jsonb) { Value = row.ToJsonString() }], ct);
    }

    private static async Task SetManagers(QtkdDbContext db, DemoSeedData data, CancellationToken ct)
    {
        foreach (var row in data.Rows("department"))
        {
            var department = Guid.Parse(DemoSeedValidator.S(row, "department_id")!);
            var manager = DemoSeedValidator.S(row, "manager_id") is { } m ? Guid.Parse(m) : (Guid?)null;
            await db.Database.ExecuteSqlInterpolatedAsync(
                $"UPDATE qtkd.department SET manager_id = {manager} WHERE department_id = {department} AND manager_id IS NULL", ct);
        }
        // SYS-CTR-10: Legal and Board have their own manager roles. Move only while the current manager is still the
        // old demo account; never overwrite a manager set by an administrator.
        await db.Database.ExecuteSqlInterpolatedAsync(
            $"UPDATE qtkd.department SET manager_id = {data.Id("legalManager")} WHERE department_id = {data.Id("legal")} AND manager_id = {data.Id("legalStaff")}", ct);
        await db.Database.ExecuteSqlInterpolatedAsync(
            $"UPDATE qtkd.department SET manager_id = {data.Id("boardChair")} WHERE department_id = {data.Id("board")} AND manager_id = {data.Id("boardMember")}", ct);
    }

    private static string Identifier(string name) =>
        SafeIdentifier().IsMatch(name) ? name : throw new InvalidOperationException("Invalid internal identifier");

    [GeneratedRegex("^[a-z_][a-z0-9_]*$")]
    private static partial Regex SafeIdentifier();
}
