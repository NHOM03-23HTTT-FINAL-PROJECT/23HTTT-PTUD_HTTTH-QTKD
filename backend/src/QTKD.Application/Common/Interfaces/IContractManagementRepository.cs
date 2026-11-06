using System.Text.Json.Nodes;
using QTKD.Application.Features.Contracts;
using QTKD.Domain.Contracts;

namespace QTKD.Application.Common.Interfaces;

// Data access for CRUD, attachments and cancellation. Submission remains in IContractRepository.
public interface IContractManagementRepository
{
    Task<ContractCatalog> CatalogAsync(Actor actor, CancellationToken ct);
    Task<ContractFilters> FiltersAsync(Actor actor, CancellationToken ct);
    Task<ContractPage> ListAsync(Actor actor, ContractQuery query, CancellationToken ct);
    Task<ContractRecord?> LockAsync(Actor actor, string code, CancellationToken ct);
    Task<JsonObject> TransactionAsync(Func<Task<JsonObject>> action, CancellationToken ct);
    Task<ContractReferences> LockReferencesAsync(Actor actor, ContractDraft draft, CancellationToken ct);
    Task<string> SaveDraftAsync(Guid? id, Actor actor, ContractDraft draft, decimal value, string customerSnapshot, CancellationToken ct);
    Task CancelAsync(Guid id, Guid actorId, string reason, CancellationToken ct);
    Task<bool> HasSignedAsync(Guid id, CancellationToken ct);
    Task<bool> HasRunningSigningAsync(Guid id, CancellationToken ct);
    Task<CancellationApprovers> ApproversAsync(Guid departmentId, CancellationToken ct);
    Task AddCancellationAsync(ContractRecord current, Actor actor, string party, string reason, Guid sales, Guid? board, CancellationToken ct);
    Task<CancellationState?> LockCancellationAsync(Guid contractId, Guid requestId, CancellationToken ct);
    Task DecideCancellationAsync(Guid requestId, bool sales, bool approved, string reason, string status, CancellationToken ct);
    Task StopApprovalRoundsAsync(Guid contractId, string code, CancellationToken ct);
    Task QueueDeliveryAsync(Guid contractId, Guid requestId, string destination, string payload, CancellationToken ct);
    Task AddFileAsync(Guid contractId, Actor actor, StagedContractFile file, CancellationToken ct);
    Task<FileMetadata?> FileAsync(Guid contractId, Guid fileId, CancellationToken ct);
    Task RemoveFileAsync(Guid contractId, Guid fileId, CancellationToken ct);
}

public interface IContractFileStorage
{
    Task<StagedContractFile> StageAsync(Stream content, string filename, long length, CancellationToken ct);
    void Discard(StagedContractFile file);
    Stream Open(FileMetadata file);
}

public class StagedContractFile
{
    public string Name { get; set; } = string.Empty;
    public long Size { get; set; }
    public string StorageKey { get; set; } = string.Empty;
    public string Fingerprint { get; set; } = string.Empty;
}

public class ContractCatalog
{
    public IReadOnlyList<ContractCustomer> Customers { get; set; } = [];
    public IReadOnlyList<ContractArea> Areas { get; set; } = [];
    public IReadOnlyList<ContractCatalogService> Services { get; set; } = [];
}

public class ContractCustomer
{
    public Guid Id { get; set; }
    public string Code { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string TaxCode { get; set; } = string.Empty;
    public string Address { get; set; } = string.Empty;
    public string Representative { get; set; } = string.Empty;
    public string? ContactName { get; set; }
    public string? Phone { get; set; }
    public string? Email { get; set; }
    public bool Active { get; set; }
}

public class ContractArea
{
    public Guid Id { get; set; }
    public Guid? ParentId { get; set; }
    public string Code { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public int Level { get; set; }
    public bool Active { get; set; }
}

public class ContractCatalogService
{
    public string ServiceCode { get; set; } = string.Empty;
    public string ServiceName { get; set; } = string.Empty;
    public string Unit { get; set; } = string.Empty;
    public bool RequiresArea { get; set; }
}

public class ContractFilters
{
    public IReadOnlyList<ContractArea> Areas { get; set; } = [];
    public IReadOnlyList<string> ContractTypes { get; set; } = [];
}

public class ContractPage
{
    public int Total { get; set; }
    public IReadOnlyList<ContractListItem> Items { get; set; } = [];
}

public class ContractListItem
{
    public Guid Id { get; set; }
    public string Code { get; set; } = string.Empty;
    public string Title { get; set; } = string.Empty;
    public string ContractType { get; set; } = string.Empty;
    public string CustomerCode { get; set; } = string.Empty;
    public string CustomerName { get; set; } = string.Empty;
    public DateOnly EffectiveFrom { get; set; }
    public DateOnly EffectiveTo { get; set; }
    public string Status { get; set; } = string.Empty;
    public string OwnerName { get; set; } = string.Empty;
    public DateTime UpdatedAt { get; set; }
    public IReadOnlyList<string> AreaCodes { get; set; } = [];
}

public class ContractReferences
{
    public ContractCustomer? Customer { get; set; }
    public IReadOnlyList<ContractCatalogService> Services { get; set; } = [];
    public Dictionary<string, IReadOnlyList<ContractArea>> AreaChains { get; set; } = [];
}

public class CancellationApprovers
{
    public Guid? Sales { get; set; }
    public Guid? Board { get; set; }
}

public class CancellationState
{
    public Guid Id { get; set; }
    public string Status { get; set; } = string.Empty;
    public string OriginalStatus { get; set; } = string.Empty;
    public string Reason { get; set; } = string.Empty;
    public int ContractVersion { get; set; }
    public int Version { get; set; }
    public Guid SalesAssigneeId { get; set; }
    public Guid? BoardAssigneeId { get; set; }
}
