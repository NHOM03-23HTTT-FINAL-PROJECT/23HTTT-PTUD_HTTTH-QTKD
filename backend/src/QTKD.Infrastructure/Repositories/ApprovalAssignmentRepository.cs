using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;
using Npgsql;
using NpgsqlTypes;
using QTKD.Application.Common.Interfaces;
using QTKD.Application.Features.ContractApprovals;
using QTKD.Domain.Contracts;
using QTKD.Domain.Notifications;
using QTKD.Infrastructure.ContractApprovals;
using QTKD.Infrastructure.Persistence;
using QTKD.Infrastructure.Persistence.Schema;

namespace QTKD.Infrastructure.Repositories;

/// <summary>
/// SYS-CTR-10 through EF Core on QtkdDbContext. The assigner and candidate checks are SQL because, inside the write
/// transaction, they lock the rows they read (FOR SHARE); the contract document is read with PostgresApprovalStore.Load
/// so the board returns the same shape as the review screens.
/// </summary>
public sealed class ApprovalAssignmentRepository(QtkdDbContext db) : IApprovalAssignmentRepository
{
    private const string AssignerSql = """
        SELECT 1 AS "Value"
        FROM qtkd.user_account u
        JOIN qtkd.role_permission p ON p.role = u.role AND p.permission_code = 'approvals.assign'
        WHERE u.user_id = @actor AND u.status = 'Active' AND NOT u.must_change_password
        """;

    private const string CandidatesSql = """
        SELECT u.user_id AS "Id", u.full_name AS "Name", r.name AS "Title", d.department_name AS "Department"
        FROM qtkd.user_account u
        JOIN qtkd.role_definition r ON r.code = u.role
        JOIN qtkd.role_permission p ON p.role = u.role AND p.permission_code = @permission
        JOIN qtkd.department d USING (department_id)
        WHERE u.role::text = ANY(@roles) AND u.status = 'Active' AND NOT u.must_change_password
          AND u.user_id <> @owner
          AND (@candidate::uuid IS NULL OR u.user_id = @candidate::uuid)
        ORDER BY u.full_name
        """;

    // Inside the write transaction: a concurrent revocation of the role or permission waits for this one.
    private const string Lock = " FOR SHARE OF u, p";
    private const string LockedAssignerSql = AssignerSql + Lock;
    private const string LockedCandidatesSql = CandidatesSql + Lock;

    private bool InTransaction => db.Database.CurrentTransaction is not null;

    public async Task<bool> IsAssignerAsync(Guid actorId, CancellationToken ct) =>
        (await db.Database.SqlQueryRaw<int>(InTransaction ? LockedAssignerSql : AssignerSql, new NpgsqlParameter("actor", actorId)).ToListAsync(ct)).Count > 0;

    public async Task<IReadOnlySet<string>> ManagedDepartmentsAsync(Guid actorId, CancellationToken ct) =>
        (await db.Set<Department>().AsNoTracking().Where(d => d.ManagerId == actorId).Select(d => d.Code).ToListAsync(ct)).ToHashSet();

    public async Task<IReadOnlyDictionary<string, string>> RoleDepartmentsAsync(CancellationToken ct) =>
        (await db.Set<RoleDefinition>().AsNoTracking().Select(r => new { r.Code, r.DepartmentCode }).ToListAsync(ct))
            .ToDictionary(r => r.Code.ToString(), r => r.DepartmentCode);

    public async Task<IReadOnlyList<Guid>> RunningContractIdsAsync(CancellationToken ct) =>
        await db.Set<ApprovalRound>().AsNoTracking()
            .Where(r => r.RecordType == DocumentRecordType.Contract && r.Result == ApprovalResult.Running && r.ContractId != null)
            .OrderBy(r => r.SubmittedAt)
            .Select(r => r.ContractId!.Value)
            .ToListAsync(ct);

    public async Task<AssignmentDocument?> LoadAsync(Guid contractId, CancellationToken ct)
    {
        var connection = (NpgsqlConnection)db.Database.GetDbConnection();
        var opened = connection.State != System.Data.ConnectionState.Open;
        if (opened) await db.Database.OpenConnectionAsync(ct);
        try
        {
            var transaction = (NpgsqlTransaction?)db.Database.CurrentTransaction?.GetDbTransaction();
            var loaded = await PostgresApprovalStore.Load(connection, transaction, contractId, ct);
            return loaded is null ? null : new(loaded.Document, loaded.OwnerId);
        }
        finally
        {
            if (opened) await db.Database.CloseConnectionAsync();
        }
    }

    public async Task<IReadOnlyList<AssignmentCandidate>> FindCandidatesAsync(CandidateQuery query, CancellationToken ct)
    {
        var rows = await db.Database.SqlQueryRaw<CandidateRow>(InTransaction ? LockedCandidatesSql : CandidatesSql,
                new NpgsqlParameter("permission", query.Permission),
                new NpgsqlParameter("roles", query.Roles.ToArray()),
                new NpgsqlParameter("owner", query.OwnerId),
                new NpgsqlParameter("candidate", NpgsqlDbType.Uuid) { Value = (object?)query.Candidate ?? DBNull.Value })
            .ToListAsync(ct);
        return rows.Select(r => new AssignmentCandidate(r.Id, r.Name, r.Title, r.Department)).ToList();
    }

    public async Task<T> InLockedContractAsync<T>(Guid contractId, Func<Task<T>> action, CancellationToken ct)
    {
        // A caller that already opened a transaction (rollback tests) keeps ownership of it.
        var owned = InTransaction ? null : await db.Database.BeginTransactionAsync(ct);
        try
        {
            var locked = await db.Database
                .SqlQuery<Guid>($"""SELECT contract_id AS "Value" FROM qtkd.contract WHERE contract_id = {contractId} FOR UPDATE""")
                .ToListAsync(ct);
            if (locked.Count == 0) throw new BusinessException("NOT_FOUND", 404);

            var result = await action();
            if (owned is not null) await owned.CommitAsync(ct);
            return result;
        }
        finally
        {
            if (owned is not null) await owned.DisposeAsync();
        }
    }

    public async Task<bool> TryUpdateStepAsync(Guid stepId, Guid assigneeId, string status, CancellationToken ct)
    {
        var next = Enum.Parse<ApprovalStepStatus>(status);
        var now = DateTime.UtcNow;
        var assigned = next is ApprovalStepStatus.Pending or ApprovalStepStatus.Reviewing;
        var accepted = next == ApprovalStepStatus.Reviewing;
        return await db.Set<ApprovalStep>()
            .Where(s => s.StepId == stepId && s.Decision == null)
            .ExecuteUpdateAsync(u => u
                .SetProperty(s => s.AssigneeId, assigneeId)
                .SetProperty(s => s.StepStatus, next)
                .SetProperty(s => s.AssignedAt, s => assigned ? (DateTime?)now : s.AssignedAt)
                .SetProperty(s => s.AcceptedAt, s => accepted ? (DateTime?)now : s.AcceptedAt), ct) == 1;
    }

    public async Task NotifyAsync(Guid recipientId, Guid contractId, string content, CancellationToken ct)
    {
        db.Notifications.Add(new Notification
        {
            RecipientId = recipientId, RecordType = RecordType.Contract, RecordId = contractId, Content = content, SendStatus = SendStatus.Pending
        });
        await db.SaveChangesAsync(ct);
    }

    public async Task AuditAsync(Guid contractId, string action, Guid actorId, string before, string after, CancellationToken ct)
    {
        db.Add(new AuditLog
        {
            EntityType = "ContractApprovalAssignment", EntityId = contractId, Action = action, ActorId = actorId,
            ValueBefore = before, ValueAfter = after
        });
        await db.SaveChangesAsync(ct);
    }

    public sealed class CandidateRow
    {
        public Guid Id { get; set; }
        public string Name { get; set; } = "";
        public string Title { get; set; } = "";
        public string Department { get; set; } = "";
    }
}
