using System.Reflection;
using System.Text.RegularExpressions;
using Microsoft.EntityFrameworkCore.Migrations;

namespace QTKD.Infrastructure.Persistence.Migrations;

/// <summary>
/// Runs the hand-written SQL files in Migrations/Sql (embedded resources). The first nine were created as Prisma
/// migrations and are kept byte-for-byte; only their own BEGIN;/COMMIT; lines are dropped because EF Core wraps
/// each migration in a transaction.
/// </summary>
public static partial class MigrationSql
{
    /// <summary>EF migration id → original Prisma migration name, in order. Used by QTKD.DbTool adopt.</summary>
    public static readonly IReadOnlyList<(string EfId, string PrismaName)> PrismaBaseline =
    [
        ("20261102000100_PrismaDictionary", "202611020001_dictionary"),
        ("20261102000200_PrismaConstraints", "202611020002_constraints"),
        ("20261102000300_PrismaIdentity", "202611020003_identity"),
        ("20261102000400_PrismaContracts", "202611020004_contracts"),
        ("20261103000100_PrismaApprovalUnassigned", "202611030001_approval_unassigned"),
        ("20261103000200_PrismaWorkflowConfig", "202611030002_workflow_config"),
        ("20261103000300_PrismaManagerRoles", "202611030003_manager_roles"),
        ("20261103000400_PrismaApprovalAssignment", "202611030004_approval_assignment"),
        ("20261103000500_PrismaStatusKeepsVersion", "202611030005_status_keeps_version"),
    ];

    public static void Run(MigrationBuilder migrationBuilder, string name, bool suppressTransaction = false) =>
        migrationBuilder.Sql(Read(name), suppressTransaction);

    /// <summary>SQL of one file in Migrations/Sql without its BEGIN;/COMMIT; lines.</summary>
    public static string Read(string name)
    {
        var resource = $"QTKD.Migrations.{name}.sql";
        using var stream = typeof(MigrationSql).Assembly.GetManifestResourceStream(resource)
            ?? throw new InvalidOperationException($"Missing embedded migration SQL {resource}.");
        using var reader = new StreamReader(stream);
        return TransactionLine().Replace(reader.ReadToEnd(), "");
    }

    /// <summary>Names of the embedded SQL files, sorted.</summary>
    public static IReadOnlyList<string> Names() => typeof(MigrationSql).Assembly.GetManifestResourceNames()
        .Where(n => n.StartsWith("QTKD.Migrations.", StringComparison.Ordinal) && n.EndsWith(".sql", StringComparison.Ordinal))
        .Select(n => n["QTKD.Migrations.".Length..^".sql".Length]).Order(StringComparer.Ordinal).ToList();

    [GeneratedRegex(@"(?m)^[ \t]*(BEGIN|COMMIT);[ \t]*\r?$\n?")]
    private static partial Regex TransactionLine();
}
