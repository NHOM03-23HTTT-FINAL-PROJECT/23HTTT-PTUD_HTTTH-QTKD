using Npgsql;
using QTKD.Application.Features.WorkflowConfigs;
using QTKD.Infrastructure.ContractApprovals;

namespace QTKD.Infrastructure.WorkflowConfigs;

/// <summary>
/// Lưu cấu hình vào qtkd.workflow_config (Prisma migration 202611030002), mỗi dòng một phiên bản.
/// DB bảo đảm mỗi mã và mỗi loại hồ sơ + phòng ban chỉ có một phiên bản đang áp dụng,
/// và không cho sửa hoặc xóa phiên bản.
/// </summary>
public sealed class PostgresWorkflowConfigStore(IApprovalDbSessions sessions) : IWorkflowConfigStore
{
    public async Task<WorkflowCatalog> Catalog(CancellationToken ct)
    {
        await using var session = await sessions.Open(false, ct);
        return await WorkflowConfigQueries.Catalog(session.Connection, session.Transaction, ct);
    }

    public async Task<IReadOnlyList<WorkflowConfig>> ActiveConfigs(CancellationToken ct)
    {
        await using var session = await sessions.Open(false, ct);
        return await WorkflowConfigQueries.All(session.Connection, session.Transaction, ct);
    }

    public async Task<WorkflowConfig?> Find(string code, CancellationToken ct)
    {
        await using var session = await sessions.Open(false, ct);
        return await WorkflowConfigQueries.ByCode(session.Connection, session.Transaction, code, ct);
    }

    public async Task<WorkflowConfig?> ActiveFor(string docType, string scope, CancellationToken ct)
    {
        await using var session = await sessions.Open(false, ct);
        return await WorkflowConfigQueries.ActiveFor(session.Connection, session.Transaction, docType, scope, ct);
    }

    public async Task<T> Write<T>(Guid actorId, string docType, string scope, Func<IWorkflowConfigWrite, Task<T>> action, CancellationToken ct)
    {
        await using var session = await sessions.Open(true, ct);
        try
        {
            // Khóa theo loại hồ sơ + phạm vi: phạm vi trùng (E3), sửa đồng thời (E4) và gửi lặp (E6)
            // đều được quyết định trên dữ liệu đã commit.
            await using (var lockCommand = PostgresApprovalStore.Command(session.Connection, session.Transaction,
                "SELECT pg_advisory_xact_lock(hashtextextended(@key, 0))", ("key", $"qtkd-workflow-config:{docType}|{scope}")))
                await lockCommand.ExecuteNonQueryAsync(ct);

            var result = await action(new PostgresWorkflowConfigWriter(session, actorId));
            await session.Commit(ct);
            return result;
        }
        catch (PostgresException error) when (error.SqlState == PostgresErrorCodes.UniqueViolation)
        {
            // Lớp chặn cuối của unique index một phiên bản đang áp dụng: phiên bản khác vừa được kích hoạt.
            throw new WorkflowConfigFailure(409, "CONFLICT");
        }
    }
}
