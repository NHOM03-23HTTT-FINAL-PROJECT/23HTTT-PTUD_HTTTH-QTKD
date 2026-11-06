using Microsoft.EntityFrameworkCore;
using QTKD.Application.Common.Interfaces;
using QTKD.Domain.Contracts;
using QTKD.Infrastructure.Persistence.Schema;
using UserRole = QTKD.Domain.Identity.UserRole;
using UserStatus = QTKD.Domain.Identity.UserStatus;

namespace QTKD.Infrastructure.Repositories;

public partial class ContractRepository
{
    public Task<bool> HasSignedAsync(Guid id, CancellationToken ct) =>
        db.Set<SigningSession>().AnyAsync(s => s.ContractId == id &&
            (s.Status == SigningStatus.Succeeded || s.CompanySignedAt != null || s.CustomerSignedAt != null), ct);

    public async Task<bool> HasRunningSigningAsync(Guid id, CancellationToken ct) =>
        (await db.Set<SigningSession>().FromSqlInterpolated($"SELECT * FROM qtkd.signing_session WHERE contract_id = {id} AND status = 'Signing' FOR UPDATE")
            .AsNoTracking().ToListAsync(ct)).Count > 0;

    public async Task<CancellationApprovers> ApproversAsync(Guid departmentId, CancellationToken ct) => new()
    {
        Sales = await (from d in db.Set<Department>()
                       join u in Users on d.ManagerId equals u.UserId
                       where d.DepartmentId == departmentId && u.Role == UserRole.SalesManager && u.Status == UserStatus.Active
                       select (Guid?)u.UserId).FirstOrDefaultAsync(ct),
        Board = await (from u in Users
                       where (u.Role == UserRole.BoardMember || u.Role == UserRole.BoardChair) && u.Status == UserStatus.Active &&
                           db.Set<Department>().Any(d => d.ManagerId == u.UserId)
                       orderby u.UserId
                       select (Guid?)u.UserId).FirstOrDefaultAsync(ct)
    };

    public async Task AddCancellationAsync(ContractRecord current, Actor actor, string party, string reason, Guid sales, Guid? board, CancellationToken ct)
    {
        db.Add(new ContractCancellationRequest
        {
            ContractId = current.Id,
            RequestedBy = actor.Id,
            Party = party,
            Reason = reason,
            OriginalStatus = Enum.Parse<ContractStatus>(current.Status),
            ContractVersion = current.Version,
            SalesAssigneeId = sales,
            BoardAssigneeId = board,
            Status = "pending-sales",
            Version = 1
        });
        await SaveManagement(ct);
    }

    public async Task<CancellationState?> LockCancellationAsync(Guid contractId, Guid requestId, CancellationToken ct)
    {
        var rows = await db.Set<ContractCancellationRequest>()
            .FromSqlInterpolated($"SELECT * FROM qtkd.contract_cancellation_request WHERE contract_id = {contractId} AND request_id = {requestId} FOR UPDATE")
            .AsNoTracking().ToListAsync(ct);
        var r = rows.SingleOrDefault();
        return r == null ? null : new CancellationState
        {
            Id = r.RequestId,
            Status = r.Status,
            OriginalStatus = r.OriginalStatus.ToString(),
            Reason = r.Reason,
            ContractVersion = r.ContractVersion,
            Version = r.Version,
            SalesAssigneeId = r.SalesAssigneeId,
            BoardAssigneeId = r.BoardAssigneeId
        };
    }

    public async Task DecideCancellationAsync(Guid requestId, bool sales, bool approved, string reason, string status, CancellationToken ct)
    {
        var entity = await db.Set<ContractCancellationRequest>().SingleAsync(r => r.RequestId == requestId, ct);
        await db.Entry(entity).ReloadAsync(ct);
        entity.Status = status;
        entity.Version++;
        if (sales)
        {
            entity.SalesApproved = approved;
            entity.SalesReason = reason;
            entity.SalesDecidedAt = DateTime.UtcNow;
        }
        else
        {
            entity.BoardApproved = approved;
            entity.BoardReason = reason;
            entity.BoardDecidedAt = DateTime.UtcNow;
        }
        await SaveManagement(ct);
    }

    public async Task StopApprovalRoundsAsync(Guid contractId, string code, CancellationToken ct)
    {
        await db.Set<ApprovalRound>().Where(r => r.ContractId == contractId && r.Result == ApprovalResult.Running)
            .ExecuteUpdateAsync(s => s.SetProperty(r => r.Result, ApprovalResult.Withdrawn).SetProperty(r => r.EndedAt, DateTime.UtcNow), ct);
        var recipients = await (from s in Steps
                                join r in Rounds on s.RoundId equals r.RoundId
                                where r.ContractId == contractId && (s.StepStatus == ApprovalStepStatus.Pending || s.StepStatus == ApprovalStepStatus.Reviewing) && s.AssigneeId != null
                                select s.AssigneeId!.Value).Distinct().ToListAsync(ct);
        foreach (var recipient in recipients)
            await NotifyAsync(recipient, contractId, $"Hồ sơ {code} đã hủy. Dừng rà soát và phê duyệt.", ct);
    }

    public async Task QueueDeliveryAsync(Guid contractId, Guid requestId, string destination, string payload, CancellationToken ct)
    {
        db.Add(new ContractDelivery
        {
            ContractId = contractId,
            RequestId = requestId,
            Destination = destination,
            Payload = payload,
            Status = destination.Length == 0 ? "Failed" : "Pending"
        });
        await SaveManagement(ct);
    }
}
