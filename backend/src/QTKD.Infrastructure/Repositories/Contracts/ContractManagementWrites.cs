using System.Globalization;
using System.Text.Json.Nodes;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using QTKD.Application.Common.Interfaces;
using QTKD.Application.Features.Contracts;
using QTKD.Domain.Contracts;
using QTKD.Infrastructure.Persistence.Schema;

namespace QTKD.Infrastructure.Repositories;

public partial class ContractRepository
{
    public async Task<JsonObject> TransactionAsync(Func<Task<JsonObject>> action, CancellationToken ct)
    {
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        var result = await action();
        await tx.CommitAsync(ct);
        return result;
    }

    private async Task<Contract> TrackedContract(Guid id, CancellationToken ct)
    {
        var entity = await db.Contracts.SingleAsync(c => c.ContractId == id, ct);
        await db.Entry(entity).ReloadAsync(ct);
        return entity;
    }

    public async Task<string> SaveDraftAsync(Guid? id, Actor actor, ContractDraft draft, decimal value, string customerSnapshot, CancellationToken ct)
    {
        var customerId = await db.Set<Customer>().Where(c => c.CustomerCode == draft.CustomerCode).Select(c => c.CustomerId).SingleAsync(ct);
        var entity = id is Guid existing ? await TrackedContract(existing, ct) : new Contract
        {
            ContractId = Guid.NewGuid(),
            ContractCode = null!,
            OwnerId = actor.Id,
            OwningDepartmentId = actor.DepartmentId,
            DocumentType = ContractDocumentType.Contract,
            Status = ContractStatus.Draft,
            Version = 1
        };
        entity.CustomerId = customerId;
        entity.Title = draft.Title.Trim();
        entity.ContractType = draft.ContractType.Trim();
        entity.StartDate = DateOnly.ParseExact(draft.EffectiveFrom, "yyyy-MM-dd", CultureInfo.InvariantCulture);
        entity.EndDate = DateOnly.ParseExact(draft.EffectiveTo, "yyyy-MM-dd", CultureInfo.InvariantCulture);
        entity.ContractValue = value;
        entity.PaymentTerms = draft.PaymentTerm.Trim();
        entity.Content = draft.Content.Trim();
        entity.SourceMode = draft.SourceMode;
        entity.TemplateCode = draft.SourceMode == "template" ? draft.TemplateCode : null;
        entity.CustomerSnapshot = customerSnapshot;
        if (id == null)
            db.Contracts.Add(entity);
        else
            entity.Version++;
        await SaveManagement(ct);
        await db.Set<ContractItem>().Where(i => i.ContractId == entity.ContractId).ExecuteDeleteAsync(ct);
        foreach (var item in draft.Services)
        {
            var serviceId = await Services.Where(s => s.ServiceCode == item.ServiceCode).Select(s => s.ServiceId).SingleAsync(ct);
            var area = await Areas.SingleOrDefaultAsync(a => a.AreaCode == item.AreaCode, ct);
            db.Add(new ContractItem { ContractId = entity.ContractId, ServiceId = serviceId, AreaId = area?.AreaId, AreaNameSnapshot = area?.AreaName ?? "" });
        }
        await SaveManagement(ct);
        return entity.ContractCode;
    }

    public async Task CancelAsync(Guid id, Guid actorId, string reason, CancellationToken ct)
    {
        var entity = await TrackedContract(id, ct);
        entity.Status = ContractStatus.Cancelled;
        entity.CancelledBy = actorId;
        entity.CancelledAt = DateTime.UtcNow;
        entity.CancellationReason = reason;
        entity.Version++;
        await SaveManagement(ct);
    }

    public async Task AddFileAsync(Guid contractId, Actor actor, StagedContractFile file, CancellationToken ct)
    {
        db.Add(new Attachment
        {
            ContractId = contractId,
            RecordType = DocumentRecordType.Contract,
            FileName = file.Name,
            FilePath = file.StorageKey,
            FileSize = file.Size,
            ContentType = "application/octet-stream",
            UploadedBy = actor.Id
        });
        var contract = await TrackedContract(contractId, ct);
        contract.Version++;
        await SaveManagement(ct);
    }

    public async Task<FileMetadata?> FileAsync(Guid contractId, Guid fileId, CancellationToken ct) =>
        await db.Set<Attachment>().AsNoTracking().Where(f => f.ContractId == contractId && f.AttachmentId == fileId)
            .Select(f => new FileMetadata(f.AttachmentId, f.FileName, f.FileSize, f.ContentType, f.FilePath)).SingleOrDefaultAsync(ct);

    public async Task RemoveFileAsync(Guid contractId, Guid fileId, CancellationToken ct)
    {
        await db.Set<Attachment>().Where(f => f.ContractId == contractId && f.AttachmentId == fileId).ExecuteDeleteAsync(ct);
        var contract = await TrackedContract(contractId, ct);
        contract.Version++;
        await SaveManagement(ct);
    }

    private async Task SaveManagement(CancellationToken ct)
    {
        try
        {
            await db.SaveChangesAsync(ct);
        }
        catch (DbUpdateConcurrencyException)
        {
            throw new BusinessException("CONFLICT");
        }
        catch (DbUpdateException error) when (error.InnerException is NpgsqlException)
        {
            var conflict = (error.InnerException as PostgresException)?.SqlState is "23505" or "40001" or "40P01" or "23514";
            throw new BusinessException(conflict ? "CONFLICT" : "DATABASE_UNAVAILABLE", conflict ? 409 : 503);
        }
    }
}
