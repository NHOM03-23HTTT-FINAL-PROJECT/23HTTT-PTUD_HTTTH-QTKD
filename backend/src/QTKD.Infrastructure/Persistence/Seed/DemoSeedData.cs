using System.Text.Json.Nodes;

namespace QTKD.Infrastructure.Persistence.Seed;

/// <summary>
/// Synthetic demo fixture (demo-seed.json, embedded). Rows use database table and column names, so the same file
/// serves the .NET seeder and the PGlite end-to-end tests in DB/tests. Fixed IDs; no real person or credential.
/// </summary>
public sealed class DemoSeedData
{
    public const string ResourceName = "QTKD.Seed.demo-seed.json";

    private DemoSeedData(IReadOnlyDictionary<string, Guid> ids, Dictionary<string, List<JsonObject>> tables, string placeholder)
    {
        Ids = ids;
        Tables = tables;
        PasswordHashPlaceholder = placeholder;
    }

    public IReadOnlyDictionary<string, Guid> Ids { get; }

    /// <summary>Table name → rows. Mutable so tests can build broken variants.</summary>
    public Dictionary<string, List<JsonObject>> Tables { get; }

    public string PasswordHashPlaceholder { get; }

    public List<JsonObject> Rows(string table) => Tables.TryGetValue(table, out var rows) ? rows : [];

    public Guid Id(string name) => Ids[name];

    /// <summary>A fresh, independent copy of the embedded fixture.</summary>
    public static DemoSeedData Load()
    {
        using var stream = typeof(DemoSeedData).Assembly.GetManifestResourceStream(ResourceName)
            ?? throw new InvalidOperationException($"Missing embedded resource {ResourceName}.");
        var root = JsonNode.Parse(stream)!.AsObject();
        var ids = root["ids"]!.AsObject().ToDictionary(p => p.Key, p => Guid.Parse(p.Value!.GetValue<string>()));
        var tables = root["tables"]!.AsObject().ToDictionary(
            p => p.Key, p => p.Value!.AsArray().Select(row => row!.AsObject()).ToList());
        return new DemoSeedData(ids, tables, root["passwordHashPlaceholder"]!.GetValue<string>());
    }

    /// <summary>Copy with every password placeholder replaced by the given hash.</summary>
    public DemoSeedData WithPasswordHash(string passwordHash)
    {
        var tables = Tables.ToDictionary(t => t.Key, t => t.Value.Select(row =>
        {
            var copy = row.DeepClone().AsObject();
            if (copy["password_hash"]?.GetValue<string>() == PasswordHashPlaceholder) copy["password_hash"] = passwordHash;
            return copy;
        }).ToList());
        return new DemoSeedData(Ids, tables, PasswordHashPlaceholder);
    }
}
