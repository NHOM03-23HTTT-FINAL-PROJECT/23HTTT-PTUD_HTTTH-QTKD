using System.Globalization;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata;

namespace QTKD.Infrastructure.Persistence.Seed;

/// <summary>
/// Offline integrity checks of the demo fixture, run before any connection (port of DB/scripts/validate-seed.ts).
/// Generic checks come from the EF model: required columns, primary/unique keys and foreign keys. The rest mirror
/// the business CHECKs and triggers so a broken fixture fails here instead of half-way through a seed.
/// </summary>
public static partial class DemoSeedValidator
{
    /// <summary>Operational tables start empty; every other table needs at least one fixture row.</summary>
    public static readonly IReadOnlySet<string> EmptyTables =
        new HashSet<string> { "contract_cancellation_request", "contract_delivery", "idempotency_request" };

    /// <summary>Throws InvalidOperationException on the first problem; returns row counts per table.</summary>
    public static IReadOnlyDictionary<string, int> Validate(DemoSeedData data, IModel model)
    {
        var entities = model.GetEntityTypes().Where(e => e.GetTableName() is not null)
            .ToDictionary(e => e.GetTableName()!);
        foreach (var table in data.Tables.Keys)
            Check(entities.ContainsKey(table), $"Unknown fixture table: {table}");
        foreach (var table in entities.Keys.Where(t => !EmptyTables.Contains(t)))
            Check(data.Rows(table).Count > 0, $"Missing fixtures: {table}");

        foreach (var (table, rows) in data.Tables)
            CheckModelRules(data, entities[table], table, rows);
        CheckBusinessRules(data);
        return data.Tables.ToDictionary(t => t.Key, t => t.Value.Count);
    }

    private static void CheckModelRules(DemoSeedData data, IEntityType entity, string table, List<JsonObject> rows)
    {
        var required = entity.GetProperties().Where(p => !p.IsNullable && p.GetDefaultValue() is null
            && p.GetDefaultValueSql() is null && p.ValueGenerated == ValueGenerated.Never).Select(p => p.GetColumnName());
        foreach (var row in rows)
            foreach (var column in required)
                Check(S(row, column) is not null, $"Required field missing: {table}.{column}");

        var keys = entity.GetKeys().Select(k => k.Properties)
            .Concat(entity.GetIndexes().Where(i => i.IsUnique).Select(i => i.Properties));
        foreach (var key in keys)
        {
            var columns = key.Select(p => p.GetColumnName()).ToList();
            var values = rows.Where(r => columns.All(c => S(r, c) is not null))
                .Select(r => string.Join("|", columns.Select(c => S(r, c)))).ToList();
            Check(values.Distinct().Count() == values.Count, $"Duplicate key in {table}: {string.Join(",", columns)}");
        }

        foreach (var fk in entity.GetForeignKeys())
        {
            var columns = fk.Properties.Select(p => p.GetColumnName()).ToList();
            var targets = fk.PrincipalKey.Properties.Select(p => p.GetColumnName()).ToList();
            var principal = data.Rows(fk.PrincipalEntityType.GetTableName()!);
            foreach (var row in rows.Where(r => columns.Any(c => S(r, c) is not null)))
                Check(principal.Any(other => columns.Select((c, i) => S(other, targets[i]) == S(row, c)).All(x => x)),
                    $"Broken FK: {table}.{string.Join(",", columns)}");
        }
    }

    private static void CheckBusinessRules(DemoSeedData data)
    {
        var users = data.Rows("user_account");
        foreach (var column in new[] { "username", "company_email" })
        {
            var keys = users.Select(u => S(u, column)!.Trim().ToLowerInvariant()).ToList();
            Check(keys.Distinct().Count() == keys.Count, $"Case-insensitive duplicate {column}");
        }
        foreach (var user in users)
        {
            var role = data.Rows("role_definition").FirstOrDefault(r => S(r, "code") == S(user, "role"));
            var department = data.Rows("department").FirstOrDefault(d => S(d, "department_id") == S(user, "department_id"));
            Check(role is not null && department is not null && S(role, "department_code") == S(department, "code"),
                "Invalid identity role/department assignment");
        }

        var areaCodes = data.Rows("area").Select(a => S(a, "area_code")!.Trim().ToLowerInvariant()).ToList();
        Check(areaCodes.Distinct().Count() == areaCodes.Count, "Case-insensitive duplicate area code");
        foreach (var customer in data.Rows("customer"))
        {
            Check(TaxCode().IsMatch(S(customer, "tax_code") ?? ""), "Invalid tax code");
            Check(!string.IsNullOrWhiteSpace(S(customer, "phone")) || !string.IsNullOrWhiteSpace(S(customer, "email")),
                "Missing customer contact");
        }
        CheckAreas(data.Rows("area"));

        foreach (var contract in data.Rows("contract"))
        {
            Check(string.CompareOrdinal(S(contract, "end_date"), S(contract, "start_date")) > 0, "Invalid contract dates");
            Check(D(contract, "contract_value") >= 0, "Negative contract value");
        }
        CheckPayments(data);
        CheckApprovals(data);

        foreach (var session in data.Rows("signing_session"))
        {
            var signer = users.FirstOrDefault(u => S(u, "user_id") == S(session, "company_signer_id"));
            Check(signer is not null && signer["can_sign"]?.GetValue<bool>() == true, "Company signer lacks signing authority");
            var file = data.Rows("attachment").First(a => S(a, "attachment_id") == S(session, "signed_file_id"));
            Check(S(file, "record_type") == S(session, "record_type"), "Signed file belongs to another document type");
            Check((S(file, "contract_id") ?? S(file, "statement_id")) == (S(session, "contract_id") ?? S(session, "statement_id")),
                "Signed file belongs to another document");
        }
        Check(data.Rows("login_session").All(r => r["is_revoked"]?.GetValue<bool>() == true), "Demo must not create live sessions");
        Check(data.Rows("password_otp").All(r => r["is_used"]?.GetValue<bool>() == true), "Demo must not create usable OTPs");
    }

    private static void CheckAreas(List<JsonObject> areas)
    {
        var byId = areas.ToDictionary(a => S(a, "area_id")!);
        var siblingNames = new HashSet<string>();
        var vi = CultureInfo.GetCultureInfo("vi-VN");
        foreach (var area in areas)
        {
            var visited = new HashSet<string>();
            var path = new List<string>();
            for (var cursor = area; cursor is not null;)
            {
                Check(visited.Add(S(cursor, "area_id")!), "Area hierarchy cycle");
                path.Insert(0, S(cursor, "area_code")!);
                var parent = S(cursor, "parent_area_id");
                cursor = parent is null ? null : byId.GetValueOrDefault(parent);
            }
            Check(path.Count == area["level"]!.GetValue<int>(), "Incorrect area level");
            Check(path.Count <= 3, "Area depth exceeds 3");
            Check(S(area, "hierarchy_path") == "/" + string.Join("/", path), "Incorrect area hierarchy path");
            Check(D(area, "area_m2") > 0 && D(area, "capacity") > 0, "Non-positive area dimensions");
            var key = $"{S(area, "parent_area_id") ?? "root"}|{S(area, "area_name")!.Trim().ToLower(vi)}";
            Check(siblingNames.Add(key), "Duplicate sibling area name");
        }
    }

    private static void CheckPayments(DemoSeedData data)
    {
        foreach (var line in data.Rows("payment_statement_line"))
        {
            Check(D(line, "amount") == D(line, "quantity") * D(line, "unit_price"), "Incorrect payment line amount");
            var price = data.Rows("price_list_line").First(r => S(r, "line_id") == S(line, "price_list_line_id"));
            var volume = data.Rows("volume_line").First(r => S(r, "volume_line_id") == S(line, "volume_line_id"));
            Check(S(price, "service_id") == S(volume, "service_id"), "Payment service mismatch");
            Check(S(price, "area_id") == S(volume, "area_id"), "Payment area mismatch");
            Check(D(line, "unit_price") == D(price, "unit_price"), "Incorrect price snapshot");
        }
        foreach (var statement in data.Rows("payment_statement"))
        {
            var subtotal = data.Rows("payment_statement_line")
                .Where(r => S(r, "statement_id") == S(statement, "statement_id")).Sum(r => D(r, "amount"));
            Check(subtotal == D(statement, "subtotal"), "Incorrect payment subtotal");
            Check(subtotal + D(statement, "tax_amount") == D(statement, "total_amount"), "Incorrect payment total");
            var period = data.Rows("volume_period").First(r => S(r, "volume_period_id") == S(statement, "volume_period_id"));
            Check(S(period, "contract_id") == S(statement, "contract_id"), "Payment volume contract mismatch");
            Check(S(period, "billing_period") == S(statement, "billing_period"), "Payment billing period mismatch");
            Check(S(period, "status") == "Locked", "Payment requires locked volume");
            Check(S(statement, "status") != "Issued" || statement["is_locked"]?.GetValue<bool>() == true, "Issued payment is not locked");
        }
    }

    private static void CheckApprovals(DemoSeedData data)
    {
        var running = new HashSet<string>();
        foreach (var round in data.Rows("approval_round"))
        {
            var source = S(round, S(round, "record_type") == "Contract" ? "contract_id" : "statement_id")!;
            var steps = data.Rows("approval_step").Where(s => S(s, "round_id") == S(round, "round_id"))
                .OrderBy(s => s["step_order"]!.GetValue<int>()).ToList();
            Check(steps.Count > 0, "Approval round has no steps");
            var result = S(round, "result") ?? "Running";
            if (result == "Running")
            {
                Check(running.Add(source), "Duplicate running approval round");
                var current = steps.Count(s => S(s, "step_status") is "Pending" or "Reviewing");
                // A due step may wait for assignment (SYS-CTR-08 A4, SYS-CTR-10): then no step is current, and the
                // first unfinished step must be NotStarted with no assignee.
                var due = steps.FirstOrDefault(s => S(s, "step_status") != "Completed");
                Check(current == 1 || (current == 0 && due is not null && (S(due, "step_status") ?? "NotStarted") == "NotStarted"
                    && S(due, "assignee_id") is null), "Round must have one current step or a due step waiting for assignment");
            }
            if (result == "Completed")
            {
                Check(steps.All(s => S(s, "step_status") == "Completed" && S(s, "decision") == "Approve"),
                    "Approval completed before every step approved");
                var ended = S(round, "ended_at");
                Check(ended is not null && steps.All(s => S(s, "decided_at") is { } at && Time(at) <= Time(ended)),
                    "Approval timestamps out of order");
            }
            foreach (var step in steps.Where(s => S(s, "decision") is not null))
            {
                Check(S(step, "decided_by") == S(step, "assignee_id"), "Decision actor is not assignee");
                Check(!string.IsNullOrWhiteSpace(S(step, "comment")), "Decision requires a comment");
                Check(S(step, "decided_by") != S(round, "submitted_by"), "Submitter cannot approve own document");
            }
        }
    }

    /// <summary>Scalar as text (JSON objects as JSON); null when missing or null.</summary>
    internal static string? S(JsonObject row, string column) => row[column] switch
    {
        null => null,
        JsonValue v when v.TryGetValue<string>(out var s) => s,
        var node => node.ToJsonString(),
    };

    private static decimal D(JsonObject row, string column) =>
        decimal.Parse(S(row, column) ?? throw new InvalidOperationException($"Missing number {column}"), CultureInfo.InvariantCulture);

    private static DateTimeOffset Time(string value) => DateTimeOffset.Parse(value, CultureInfo.InvariantCulture);

    private static void Check(bool condition, string message)
    {
        if (!condition) throw new InvalidOperationException(message);
    }

    [GeneratedRegex(@"^\d{10}(\d{3})?$")]
    private static partial Regex TaxCode();
}
