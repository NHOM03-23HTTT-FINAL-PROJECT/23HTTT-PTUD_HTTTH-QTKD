using Microsoft.Extensions.Configuration;
using Npgsql;

namespace QTKD.Infrastructure.ContractApprovals;

public interface IApprovalDbSessions
{
    Task<ApprovalDbSession> Open(bool write, CancellationToken ct);
}
public sealed class ApprovalDbSessions(IConfiguration config) : IApprovalDbSessions
{
    public async Task<ApprovalDbSession> Open(bool write, CancellationToken ct)
    {
        var c = new NpgsqlConnection(config.GetConnectionString("Identity"));
        try { await c.OpenAsync(ct); return new(c, write ? await c.BeginTransactionAsync(ct) : null, true); }
        catch { await c.DisposeAsync(); throw; }
    }
}
public sealed class ApprovalDbSession : IAsyncDisposable
{
    public NpgsqlConnection Connection { get; }
    public NpgsqlTransaction? Transaction { get; }
    private readonly bool owns;
    internal ApprovalDbSession(NpgsqlConnection connection, NpgsqlTransaction? transaction, bool owns)
    { Connection = connection; Transaction = transaction; this.owns = owns; }
    public Task Commit(CancellationToken ct) => owns && Transaction is not null ? Transaction.CommitAsync(ct) : Task.CompletedTask;
    public async ValueTask DisposeAsync()
    {
        if (!owns) return;
        if (Transaction is not null) await Transaction.DisposeAsync();
        await Connection.DisposeAsync();
    }
}
