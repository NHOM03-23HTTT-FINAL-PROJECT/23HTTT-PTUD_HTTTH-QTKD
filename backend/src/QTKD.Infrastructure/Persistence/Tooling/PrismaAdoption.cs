using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using QTKD.Infrastructure.Persistence.Migrations;

namespace QTKD.Infrastructure.Persistence.Tooling;

/// <summary>
/// Hands a database built by Prisma Migrate over to EF Core without running any DDL: when qtkd._prisma_migrations
/// shows all nine baseline migrations finished, the matching EF ids are recorded in qtkd."__EFMigrationsHistory".
/// _prisma_migrations is kept as history.
/// </summary>
public static class PrismaAdoption
{
    public static async Task<bool> IsPrismaDatabase(QtkdDbContext db, CancellationToken ct) =>
        await db.Database.SqlQueryRaw<bool>(
            "SELECT to_regclass('qtkd._prisma_migrations') IS NOT NULL AS \"Value\"").SingleAsync(ct);

    /// <summary>Returns the EF ids it recorded (empty when already adopted).</summary>
    public static async Task<IReadOnlyList<string>> Adopt(QtkdDbContext db, CancellationToken ct)
    {
        if (!await IsPrismaDatabase(db, ct))
            throw new InvalidOperationException("Không có qtkd._prisma_migrations: đây không phải DB do Prisma dựng. Dùng lệnh migrate.");
        var finished = await db.Database.SqlQueryRaw<string>("""
            SELECT migration_name AS "Value" FROM qtkd._prisma_migrations
            WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL
            """).ToListAsync(ct);
        var expected = MigrationSql.PrismaBaseline.Select(m => m.PrismaName).ToList();
        var missing = expected.Except(finished).ToList();
        if (missing.Count > 0)
            throw new InvalidOperationException("Prisma chưa áp đủ baseline, thiếu: " + string.Join(", ", missing) + ". Không adopt.");
        var unknown = finished.Except(expected).ToList();
        if (unknown.Count > 0)
            throw new InvalidOperationException("DB có migration Prisma ngoài baseline: " + string.Join(", ", unknown) + ". Đối chiếu trước khi adopt.");

        var history = db.GetService<IHistoryRepository>();
        var version = typeof(DbContext).Assembly.GetName().Version!.ToString(3);
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        await db.Database.ExecuteSqlRawAsync(history.GetCreateIfNotExistsScript(), ct);
        var applied = (await history.GetAppliedMigrationsAsync(ct)).Select(r => r.MigrationId).ToHashSet();
        var recorded = new List<string>();
        foreach (var (efId, _) in MigrationSql.PrismaBaseline.Where(m => !applied.Contains(m.EfId)))
        {
            await db.Database.ExecuteSqlRawAsync(history.GetInsertScript(new HistoryRow(efId, version)), ct);
            recorded.Add(efId);
        }
        await tx.CommitAsync(ct);
        return recorded;
    }

    /// <summary>True when the DB was built by Prisma but not adopted yet: migrate would re-run the baseline DDL.</summary>
    public static async Task<bool> NeedsAdoption(QtkdDbContext db, CancellationToken ct)
    {
        if (!await IsPrismaDatabase(db, ct)) return false;
        var history = db.GetService<IHistoryRepository>();
        if (!await history.ExistsAsync(ct)) return true;
        var applied = (await history.GetAppliedMigrationsAsync(ct)).Select(r => r.MigrationId).ToHashSet();
        return MigrationSql.PrismaBaseline.Any(m => !applied.Contains(m.EfId));
    }
}
