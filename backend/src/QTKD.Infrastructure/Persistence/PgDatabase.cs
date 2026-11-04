using System.Text.Json;
using System.Text.Json.Nodes;
using Npgsql;
using NpgsqlTypes;

namespace QTKD.Infrastructure.Persistence;

public class PgDatabase
{
    private readonly NpgsqlDataSource _source;

    public static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    public PgDatabase(NpgsqlDataSource source)
    {
        _source = source;
    }

    public Task<NpgsqlConnection> Open(CancellationToken ct) =>
        _source.OpenConnectionAsync(ct).AsTask();

    public static NpgsqlCommand Command(NpgsqlConnection connection, NpgsqlTransaction? tx, string sql, params object?[] values)
    {
        var command = new NpgsqlCommand(sql, connection, tx);
        foreach (var value in values)
        {
            var parameter = new NpgsqlParameter
            {
                Value = value ?? DBNull.Value
            };

            if (value is JsonNode node)
            {
                parameter.NpgsqlDbType = NpgsqlDbType.Jsonb;
                parameter.Value = node.ToJsonString(Json);
            }

            command.Parameters.Add(parameter);
        }

        return command;
    }

    public static async Task<int> Execute(NpgsqlConnection c, NpgsqlTransaction? tx, string sql, CancellationToken ct, params object?[] values)
    {
        await using var cmd = Command(c, tx, sql, values);
        return await cmd.ExecuteNonQueryAsync(ct);
    }

    public static async Task<JsonObject?> Object(NpgsqlConnection c, NpgsqlTransaction? tx, string sql, CancellationToken ct, params object?[] values)
    {
        await using var cmd = Command(c, tx, sql, values);
        var result = await cmd.ExecuteScalarAsync(ct);
        return result is null or DBNull ? null : JsonNode.Parse(result.ToString()!)!.AsObject();
    }

    public static async Task<JsonArray> Array(NpgsqlConnection c, NpgsqlTransaction? tx, string sql, CancellationToken ct, params object?[] values)
    {
        await using var cmd = Command(c, tx, sql, values);
        var result = await cmd.ExecuteScalarAsync(ct);
        return result is null or DBNull ? [] : JsonNode.Parse(result.ToString()!)!.AsArray();
    }
}
