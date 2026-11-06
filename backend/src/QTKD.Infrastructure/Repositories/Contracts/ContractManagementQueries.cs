using System.Linq.Expressions;
using Microsoft.EntityFrameworkCore;
using QTKD.Application.Common.Interfaces;
using QTKD.Application.Features.Contracts;
using QTKD.Domain.Contracts;
using QTKD.Infrastructure.Persistence.Schema;
using Area = QTKD.Domain.Entities.Area;
using Service = QTKD.Domain.Entities.Service;
using AreaStatus = QTKD.Domain.Enums.ActiveStatus;

namespace QTKD.Infrastructure.Repositories;

public partial class ContractRepository
{
    private static readonly Expression<Func<Customer, ContractCustomer>> CustomerData = c => new ContractCustomer
    {
        Id = c.CustomerId,
        Code = c.CustomerCode,
        Name = c.CustomerName,
        TaxCode = c.TaxCode,
        Address = c.Address,
        Representative = c.LegalRepresentative,
        ContactName = c.ContactName,
        Phone = c.Phone,
        Email = c.Email,
        Active = c.Status == ActiveStatus.Active
    };

    private static readonly Expression<Func<Area, ContractArea>> AreaData = a => new ContractArea
    {
        Id = a.AreaId,
        ParentId = a.ParentAreaId,
        Code = a.AreaCode,
        Name = a.AreaName,
        Level = a.Level,
        Active = a.Status == AreaStatus.Active
    };

    private static readonly Expression<Func<Service, ContractCatalogService>> ServiceData = s => new ContractCatalogService
    {
        ServiceCode = s.ServiceCode,
        ServiceName = s.ServiceName,
        Unit = s.Unit,
        RequiresArea = s.RequiresArea
    };

    public async Task<ContractCatalog> CatalogAsync(CancellationToken ct) => new()
    {
        Customers = await db.Set<Customer>().AsNoTracking().Where(c => c.Status == ActiveStatus.Active).Select(CustomerData).ToListAsync(ct),
        Areas = await Areas.OrderBy(a => a.HierarchyPath).Select(AreaData).ToListAsync(ct),
        Services = await Services.OrderBy(s => s.ServiceCode).Select(ServiceData).ToListAsync(ct)
    };

    public async Task<ContractFilters> FiltersAsync(Actor actor, CancellationToken ct)
    {
        var visible = Scoped(actor);
        return new ContractFilters
        {
            Areas = await Areas.Where(a => Items.Any(i => i.AreaId == a.AreaId && visible.Any(c => c.ContractId == i.ContractId)))
                .OrderBy(a => a.HierarchyPath).Select(AreaData).ToListAsync(ct),
            ContractTypes = await visible.Select(c => c.ContractType).Distinct().OrderBy(t => t).ToListAsync(ct)
        };
    }

    public async Task<ContractPage> ListAsync(Actor actor, ContractQuery query, CancellationToken ct)
    {
        var source = Scoped(actor);
        if (!string.IsNullOrWhiteSpace(query.Keyword))
        {
            var pattern = "%" + query.Keyword.Trim() + "%";
            source = source.Where(c => EF.Functions.ILike(c.Title, pattern) || EF.Functions.ILike(c.ContractCode, pattern) ||
                db.Set<Customer>().Any(u => u.CustomerId == c.CustomerId && EF.Functions.ILike(u.CustomerName, pattern)));
        }
        if (!string.IsNullOrEmpty(query.Status))
        {
            var status = Enum.Parse<ContractStatus>(query.Status.Replace("-", ""), true);
            source = source.Where(c => c.Status == status);
        }
        if (!string.IsNullOrEmpty(query.ContractType))
            source = source.Where(c => c.ContractType == query.ContractType);
        if (!string.IsNullOrEmpty(query.AreaCode))
            source = source.Where(c => Items.Any(i => i.ContractId == c.ContractId && Areas.Any(a => a.AreaId == i.AreaId && a.AreaCode == query.AreaCode)));
        // "Theo dõi tiến độ" (SYS-CTR-11 A10): only records submitted at least once.
        if (query.View == "tracking")
            source = source.Where(c => Rounds.Any(r => r.ContractId == c.ContractId));

        var total = await source.CountAsync(ct);
        var page = await (from c in source
                          join customer in db.Set<Customer>() on c.CustomerId equals customer.CustomerId
                          join owner in Users on c.OwnerId equals owner.UserId
                          orderby c.UpdatedAt descending, c.ContractId
                          select new ContractListItem
                          {
                              Id = c.ContractId,
                              Code = c.ContractCode,
                              Title = c.Title,
                              ContractType = c.ContractType,
                              CustomerCode = customer.CustomerCode,
                              CustomerName = customer.CustomerName,
                              EffectiveFrom = c.StartDate,
                              EffectiveTo = c.EndDate,
                              Status = c.Status.ToString(),
                              OwnerName = owner.FullName,
                              UpdatedAt = c.UpdatedAt,
                              StepLabel = (from r in Rounds
                                           where r.ContractId == c.ContractId && r.Result == ApprovalResult.Running
                                           from s in Steps
                                           where s.RoundId == r.RoundId && s.StepStatus != ApprovalStepStatus.Completed
                                           orderby s.StepOrder
                                           select s.StepName).FirstOrDefault()
                          }).Skip((query.Page - 1) * query.Size).Take(query.Size).ToListAsync(ct);
        var ids = page.Select(c => c.Id).ToArray();
        var areas = await (from i in Items
                           join a in Areas on i.AreaId equals a.AreaId
                           where ids.Contains(i.ContractId)
                           select new { i.ContractId, a.AreaCode }).ToListAsync(ct);
        foreach (var item in page)
            item.AreaCodes = areas.Where(a => a.ContractId == item.Id).Select(a => a.AreaCode).Distinct().ToArray();
        return new ContractPage { Total = total, Items = page };
    }

    public async Task<ContractRecord?> LockAsync(Actor actor, string code, CancellationToken ct)
    {
        var id = await Scoped(actor).Where(c => c.ContractCode == code).Select(c => (Guid?)c.ContractId).SingleOrDefaultAsync(ct);
        if (id == null)
            return null;
        await db.Contracts.FromSqlInterpolated($"SELECT * FROM qtkd.contract WHERE contract_id = {id.Value} FOR UPDATE")
            .AsNoTracking().ToListAsync(ct);
        return await FindAsync(actor, code, ct);
    }

    public async Task<ContractReferences> LockReferencesAsync(ContractDraft draft, CancellationToken ct)
    {
        var customers = await db.Set<Customer>().FromSqlInterpolated($"SELECT * FROM qtkd.customer WHERE customer_code = {draft.CustomerCode} FOR SHARE")
            .AsNoTracking().Select(CustomerData).ToListAsync(ct);
        var result = new ContractReferences { Customer = customers.SingleOrDefault() };
        var services = new List<ContractCatalogService>();
        foreach (var item in draft.Services.OrderBy(s => s.ServiceCode, StringComparer.Ordinal))
        {
            var rows = await db.Set<Service>().FromSqlInterpolated($"SELECT * FROM qtkd.service WHERE service_code = {item.ServiceCode} FOR SHARE")
                .AsNoTracking().ToListAsync(ct);
            services.AddRange(rows.Select(ServiceData.Compile()));
            if (string.IsNullOrWhiteSpace(item.AreaCode) || result.AreaChains.ContainsKey(item.AreaCode))
                continue;
            var areas = await db.Set<Area>().FromSqlInterpolated($"""
                WITH RECURSIVE chain AS (
                    SELECT area_id, parent_area_id FROM qtkd.area WHERE area_code = {item.AreaCode}
                    UNION
                    SELECT a.area_id, a.parent_area_id FROM qtkd.area a JOIN chain x ON a.area_id = x.parent_area_id
                )
                SELECT a.* FROM qtkd.area a JOIN chain x USING(area_id) ORDER BY a.area_id FOR SHARE OF a
                """).AsNoTracking().ToListAsync(ct);
            result.AreaChains[item.AreaCode] = areas.Select(AreaData.Compile()).ToArray();
        }
        result.Services = services;
        return result;
    }
}
