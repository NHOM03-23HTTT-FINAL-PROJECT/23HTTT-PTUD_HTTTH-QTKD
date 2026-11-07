using Microsoft.EntityFrameworkCore;
using QTKD.Domain.Customers;
using UserRole = QTKD.Domain.Identity.UserRole;
using QTKD.Infrastructure.Persistence.Schema;

namespace QTKD.Infrastructure.Repositories;

public sealed partial class CustomerRepository
{
    public async Task<CustomerSuspensionSnapshot> SuspensionSnapshot(Guid customer, Guid actor, bool forConfirmation, CancellationToken ct)
    {
        if (forConfirmation && db.Database.IsNpgsql())
        {
            // The service holds the customer FOR UPDATE. Contract creation takes a
            // customer lock too; share-lock existing contracts against changes during confirmation.
            await db.Set<Contract>().FromSqlInterpolated($"SELECT * FROM qtkd.contract WHERE customer_id={customer} ORDER BY contract_id FOR SHARE")
                .AsNoTracking().ToListAsync(ct);
            await db.Set<ApprovalRound>().FromSqlInterpolated($"""
                SELECT r.* FROM qtkd.approval_round r JOIN qtkd.contract c ON c.contract_id=r.contract_id
                WHERE c.customer_id={customer} ORDER BY r.round_id FOR SHARE OF r
                """).AsNoTracking().ToListAsync(ct);
        }
        var viewer = await Users.SingleAsync(u => u.UserId == actor, ct);
        var canRead = await HasPermission(viewer.Role, "contracts.view", ct);
        var managesDepartment = await db.Set<Department>().AnyAsync(d => d.DepartmentId == viewer.DepartmentId && d.ManagerId == actor, ct);
        var contracts = await db.Set<Contract>().AsNoTracking().Where(c => c.CustomerId == customer)
            .OrderBy(c => c.ContractId).Select(c => new
            {
                c.ContractId, c.ContractCode, c.Title, c.Status, c.Version,
                Visible = canRead && c.DocumentType == ContractDocumentType.Contract && (viewer.Role == UserRole.SalesStaff && c.OwnerId == actor
                    || viewer.Role == UserRole.SalesManager && managesDepartment && c.OwningDepartmentId == viewer.DepartmentId)
            }).ToArrayAsync(ct);
        var rounds = await (from r in db.Set<ApprovalRound>().AsNoTracking()
                            join c in db.Set<Contract>().AsNoTracking() on r.ContractId equals (Guid?)c.ContractId
                            where c.CustomerId == customer && r.Result == ApprovalResult.Running
                            orderby r.RoundId
                            select new { r.RoundId, c.ContractId, r.RoundNo, r.RecordVersion, r.Result }).ToArrayAsync(ct);
        var paymentApprovals = await (from r in db.Set<ApprovalRound>().AsNoTracking()
                                      join s in db.Set<PaymentStatement>() on r.StatementId equals (Guid?)s.StatementId
                                      join c in db.Set<Contract>() on s.ContractId equals c.ContractId
                                      where c.CustomerId == customer && r.Result == ApprovalResult.Running
                                      select r.RoundId).AnyAsync(ct);
        return new(contracts.Select(c => new CustomerRelatedContract(c.ContractId, c.ContractCode, c.Title,
                c.Status.ToString(), c.Version, c.Visible)).ToArray(),
            rounds.Select(r => new CustomerRelatedApproval(r.RoundId, r.ContractId, r.RoundNo, r.RecordVersion, r.Result.ToString())).ToArray(),
            paymentApprovals);
    }
}
