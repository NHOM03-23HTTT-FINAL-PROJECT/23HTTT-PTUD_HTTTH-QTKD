using System.Text;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Metadata;
using Npgsql;
using QTKD.Infrastructure.Persistence;
using QTKD.Infrastructure.Persistence.Seed;
using QTKD.Infrastructure.Persistence.Tooling;

// QTKD.DbTool <command> [--disposable-local] [--env <file>]
//   connection-check  SELECT 1 only
//   status            applied / pending EF migrations
//   adopt             DB built by Prisma: record the baseline in EF history, no DDL
//   migrate           apply pending EF migrations
//   seed [--dry-run]  idempotent demo seed (--dry-run: offline fixture check, no connection)
// DIRECT_URL and SEED_PASSWORD come from the environment or DB/.env. Never commit or paste them.
Console.OutputEncoding = Encoding.UTF8;
var command = args.FirstOrDefault(a => !a.StartsWith("--", StringComparison.Ordinal));
var envFile = Option("--env") ?? FindEnvFile();
if (envFile is not null) LoadEnv(envFile);
var ct = CancellationToken.None;

try
{
    switch (command)
    {
        case "seed" when args.Contains("--dry-run"):
        {
            await using var offline = new QtkdDbContext(QtkdPersistence.Options("Host=offline.invalid"));
            var counts = DemoSeedValidator.Validate(DemoSeedData.Load(), offline.GetService<IDesignTimeModel>().Model);
            foreach (var (table, count) in counts) Console.WriteLine($"{table,-32}{count,4}");
            Console.WriteLine("PASS: fixture integrity checked offline. No connection, schema creation or INSERT executed.");
            return 0;
        }
        case "connection-check":
        {
            await using var connection = new NpgsqlConnection(Connection().ConnectionString);
            await connection.OpenAsync(ct);
            await using var select = new NpgsqlCommand("SELECT 1", connection);
            await select.ExecuteScalarAsync(ct);
            Console.WriteLine("PASS: database connection and SELECT 1 succeeded. No migration or seed executed.");
            return 0;
        }
        case "status":
        {
            await using var db = Context();
            if (await PrismaAdoption.NeedsAdoption(db, ct))
                Console.WriteLine("DB do Prisma dựng, chưa adopt sang EF Core. Chạy lệnh adopt trước migrate.");
            var applied = (await db.Database.GetAppliedMigrationsAsync(ct)).ToList();
            var pending = (await db.Database.GetPendingMigrationsAsync(ct)).ToList();
            foreach (var id in applied) Console.WriteLine($"applied  {id}");
            foreach (var id in pending) Console.WriteLine($"pending  {id}");
            Console.WriteLine($"{applied.Count} applied, {pending.Count} pending.");
            return 0;
        }
        case "adopt":
        {
            await using var db = Context();
            var recorded = await PrismaAdoption.Adopt(db, ct);
            foreach (var id in recorded) Console.WriteLine($"recorded {id}");
            Console.WriteLine(recorded.Count == 0 ? "Đã adopt từ trước; không ghi gì." : $"Adopted: {recorded.Count} baseline migration(s) recorded, no DDL executed.");
            return 0;
        }
        case "migrate":
        {
            await using var db = Context();
            if (await PrismaAdoption.NeedsAdoption(db, ct))
                throw new InvalidOperationException("DB do Prisma dựng nhưng chưa adopt. Chạy adopt trước; migrate sẽ không chạy lại DDL baseline.");
            var pending = (await db.Database.GetPendingMigrationsAsync(ct)).ToList();
            await db.Database.MigrateAsync(ct);
            Console.WriteLine(pending.Count == 0 ? "Không có migration chờ." : "Applied: " + string.Join(", ", pending));
            return 0;
        }
        case "seed":
        {
            var password = Environment.GetEnvironmentVariable("SEED_PASSWORD");
            if (password is null || password.StartsWith("REPLACE_", StringComparison.Ordinal) || password.Length < 12
                || Encoding.UTF8.GetByteCount(password) > 72)
                throw new InvalidOperationException("SEED_PASSWORD cần ít nhất 12 ký tự, tối đa 72 byte UTF-8; đặt trong DB/.env.");
            var data = DemoSeedData.Load().WithPasswordHash(BCrypt.Net.BCrypt.HashPassword(password, 12));
            await using var db = Context();
            await DemoSeeder.SeedAsync(db, data, ct);
            Console.WriteLine("Seed committed. Existing demo rows and passwords were preserved.");
            return 0;
        }
        default:
            Console.Error.WriteLine("Lệnh: connection-check | status | adopt | migrate | seed [--dry-run]. Tùy chọn: --env <file>, --disposable-local.");
            return 1;
    }
}
catch (InvalidOperationException error) when (error.InnerException is null)
{
    Console.Error.WriteLine(error.Message);
    return 1;
}
catch (Exception error)
{
    // Raw errors may contain host names, paths or credentials; only a disposable local DB shows them.
    Console.Error.WriteLine(ConnectionDiagnostics.Describe(error));
    if (args.Contains("--disposable-local")) Console.Error.WriteLine(error);
    return 1;
}

NpgsqlConnectionStringBuilder Connection() => DatabaseUrl.Require(Environment.GetEnvironmentVariable("DIRECT_URL"),
    args.Contains("--disposable-local"), envFile is null ? null : Path.GetDirectoryName(Path.GetFullPath(envFile)));

QtkdDbContext Context() => new(QtkdPersistence.Options(Connection().ConnectionString));

string? Option(string name)
{
    var index = Array.IndexOf(args, name);
    return index >= 0 && index + 1 < args.Length ? args[index + 1] : null;
}

static string? FindEnvFile()
{
    for (var dir = new DirectoryInfo(Environment.CurrentDirectory); dir is not null; dir = dir.Parent)
    {
        if (dir.Name == "DB" && File.Exists(Path.Combine(dir.FullName, ".env"))) return Path.Combine(dir.FullName, ".env");
        var candidate = Path.Combine(dir.FullName, "DB", ".env");
        if (File.Exists(candidate)) return candidate;
    }
    return null;
}

// Minimal KEY=VALUE reader. Variables already set in the environment win.
static void LoadEnv(string file)
{
    foreach (var line in File.ReadAllLines(file))
    {
        var text = line.Trim();
        if (text.Length == 0 || text.StartsWith('#') || !text.Contains('=')) continue;
        var key = text[..text.IndexOf('=')].Trim();
        var value = text[(text.IndexOf('=') + 1)..].Trim();
        if (value.Length >= 2 && (value[0] == '"' || value[0] == '\'') && value[^1] == value[0]) value = value[1..^1];
        if (Environment.GetEnvironmentVariable(key) is null) Environment.SetEnvironmentVariable(key, value);
    }
}
