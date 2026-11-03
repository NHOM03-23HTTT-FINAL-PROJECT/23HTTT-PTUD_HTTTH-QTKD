using System.Text.Json;
using Npgsql;
using QTKD.Application.Features.WorkflowConfigs;
using QTKD.Infrastructure.ContractApprovals;

namespace QTKD.Infrastructure.WorkflowConfigs;

/// <summary>Câu SQL đọc dùng chung cho store (ngoài transaction) và writer (trong transaction).</summary>
internal static class WorkflowConfigQueries
{
    public static readonly JsonSerializerOptions Json = JsonSerializerOptions.Web;

    #region Danh mục

    private const string PeopleSql = """
        SELECT u.user_id, u.full_name, r.name, d.code, d.department_name, u.status <> 'Disabled', u.can_sign
        FROM qtkd.user_account u
        JOIN qtkd.role_definition r ON r.code = u.role
        JOIN qtkd.department d USING (department_id)
        ORDER BY u.full_name, u.user_id
        """;

    private const string DepartmentsSql = "SELECT code, department_name FROM qtkd.department ORDER BY code";

    /// <summary>Phạm vi = phòng ban có vai trò được lập hợp đồng (contracts.create), nên đi theo phân quyền.</summary>
    private const string ScopesSql = """
        SELECT DISTINCT d.code, d.department_name
        FROM qtkd.department d
        JOIN qtkd.role_definition r ON r.department_code = d.code
        JOIN qtkd.role_permission p ON p.role = r.code AND p.permission_code = 'contracts.create'
        ORDER BY d.code
        """;

    public static async Task<WorkflowCatalog> Catalog(NpgsqlConnection c, NpgsqlTransaction? tx, CancellationToken ct)
    {
        var people = await ReadAll(c, tx, PeopleSql, [], r => new WorkflowPerson(
            Id: r.GetGuid(0), Name: r.GetString(1), Title: r.GetString(2), DepartmentCode: r.GetString(3),
            Department: r.GetString(4), Active: r.GetBoolean(5), CanSign: r.GetBoolean(6)), ct);
        var scopes = await ReadAll(c, tx, ScopesSql, [], ReadDepartment, ct);
        var departments = await ReadAll(c, tx, DepartmentsSql, [], ReadDepartment, ct);
        return new(people, scopes, departments);
    }

    private static WorkflowDepartment ReadDepartment(NpgsqlDataReader r) => new(r.GetString(0), r.GetString(1));

    #endregion

    #region Cấu hình

    /// <summary>Lấy mọi phiên bản của các mã có phiên bản đang áp dụng thỏa {0}.</summary>
    private const string ConfigsSql = """
        SELECT w.code, w.version, w.config_name, w.doc_type, d.code, d.department_name,
               w.stages::text, w.change_summary, w.is_active, u.full_name, w.activated_at
        FROM qtkd.workflow_config w
        JOIN qtkd.department d USING (department_id)
        JOIN qtkd.user_account u ON u.user_id = w.activated_by
        WHERE w.code IN (SELECT w.code FROM qtkd.workflow_config w WHERE w.is_active AND ({0}))
        ORDER BY w.code, w.version
        """;

    private const string ActiveForFilter = """
        w.code = (SELECT a.code FROM qtkd.workflow_config a JOIN qtkd.department ad USING (department_id)
                  WHERE a.is_active AND a.doc_type = @type AND ad.code = @scope)
        """;

    public static Task<IReadOnlyList<WorkflowConfig>> All(NpgsqlConnection c, NpgsqlTransaction? tx, CancellationToken ct) =>
        Configs(c, tx, "TRUE", [], ct);

    public static async Task<WorkflowConfig?> ByCode(NpgsqlConnection c, NpgsqlTransaction? tx, string code, CancellationToken ct) =>
        (await Configs(c, tx, "w.code = @code", [("code", code)], ct)).FirstOrDefault();

    public static async Task<WorkflowConfig?> ActiveFor(NpgsqlConnection c, NpgsqlTransaction? tx, string docType, string scope, CancellationToken ct) =>
        (await Configs(c, tx, ActiveForFilter, [("type", docType), ("scope", scope)], ct)).FirstOrDefault();

    private sealed record VersionRow(string Code, string Name, string DocType, string Scope, string ScopeName, bool Active, WorkflowVersion Version);

    /// <summary>Gom các dòng phiên bản thành cấu hình: thông tin lấy từ phiên bản đang áp dụng, History là mọi phiên bản.</summary>
    private static async Task<IReadOnlyList<WorkflowConfig>> Configs(NpgsqlConnection c, NpgsqlTransaction? tx, string filter,
        (string Name, object? Value)[] parameters, CancellationToken ct)
    {
        var rows = await ReadAll(c, tx, string.Format(ConfigsSql, filter), parameters, r => new VersionRow(
            Code: r.GetString(0), Name: r.GetString(2), DocType: r.GetString(3), Scope: r.GetString(4), ScopeName: r.GetString(5),
            Active: r.GetBoolean(8),
            Version: new WorkflowVersion(
                Version: r.GetInt32(1), ActivatedAt: r.GetDateTime(10), ActivatedByName: r.GetString(9), Summary: r.GetString(7),
                Stages: JsonSerializer.Deserialize<WorkflowStage[]>(r.GetString(6), Json) ?? [])), ct);

        return rows.GroupBy(row => row.Code).Select(versions =>
        {
            var active = versions.Single(row => row.Active);
            return new WorkflowConfig(active.Code, active.Name, active.DocType, active.Scope, active.ScopeName,
                active.Version.Version, active.Version.ActivatedAt, active.Version.ActivatedByName, active.Version.Stages,
                History: versions.Select(row => row.Version).ToArray());
        }).ToArray();
    }

    #endregion

    private static async Task<IReadOnlyList<T>> ReadAll<T>(NpgsqlConnection c, NpgsqlTransaction? tx, string sql,
        (string Name, object? Value)[] parameters, Func<NpgsqlDataReader, T> map, CancellationToken ct)
    {
        await using var cmd = PostgresApprovalStore.Command(c, tx, sql, parameters);
        await using var reader = await cmd.ExecuteReaderAsync(ct);
        var items = new List<T>();
        while (await reader.ReadAsync(ct)) items.Add(map(reader));
        return items;
    }
}
