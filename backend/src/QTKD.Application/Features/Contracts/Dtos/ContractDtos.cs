using System.Text.Json.Nodes;

namespace QTKD.Application.Features.Contracts;

public class ServiceDraft
{
    public string Id { get; set; } = string.Empty;
    public string ServiceCode { get; set; } = string.Empty;
    public string ServiceName { get; set; } = string.Empty;
    public string Unit { get; set; } = string.Empty;
    public bool RequiresArea { get; set; }
    public string AreaCode { get; set; } = string.Empty;
}

public class ContractDraft
{
    public string CustomerCode { get; set; } = string.Empty;
    public string SourceMode { get; set; } = string.Empty;
    public string TemplateCode { get; set; } = string.Empty;
    public string Title { get; set; } = string.Empty;
    public string ContractType { get; set; } = string.Empty;
    public string EffectiveFrom { get; set; } = string.Empty;
    public string EffectiveTo { get; set; } = string.Empty;
    public string Value { get; set; } = string.Empty;
    public string PaymentTerm { get; set; } = string.Empty;
    public ServiceDraft[] Services { get; set; } = Array.Empty<ServiceDraft>();
    public string Content { get; set; } = string.Empty;
}

public class CreateContract
{
    public ContractDraft Draft { get; set; } = new ContractDraft();
}

public class UpdateContract
{
    public int BaseVersion { get; set; }
    public ContractDraft Draft { get; set; } = new ContractDraft();
}

public class CancelContract
{
    public int BaseVersion { get; set; }
    public string Reason { get; set; } = string.Empty;
}

public class CancellationDraft
{
    public int BaseVersion { get; set; }
    public string Party { get; set; } = string.Empty;
    public string Reason { get; set; } = string.Empty;
}

public class CancellationDecision
{
    public int BaseVersion { get; set; }
    public bool Approve { get; set; }
    public string Reason { get; set; } = string.Empty;
}

public class ContractQuery
{
    public string? Keyword { get; set; } = string.Empty;
    public string? Status { get; set; } = string.Empty;
    public string? AreaCode { get; set; } = string.Empty;
    public string? ContractType { get; set; } = string.Empty;
    public int Page { get; set; } = 1;
    public int Size { get; set; } = 10;
    public string? View { get; set; } = "all";
}

public class StoredContract
{
    public StoredContract(Guid id, Guid ownerId, Guid departmentId, string status, int version, JsonObject data)
    {
        Id = id;
        OwnerId = ownerId;
        DepartmentId = departmentId;
        Status = status;
        Version = version;
        Data = data;
    }

    public Guid Id { get; set; }
    public Guid OwnerId { get; set; }
    public Guid DepartmentId { get; set; }
    public string Status { get; set; } = string.Empty;
    public int Version { get; set; }
    public JsonObject Data { get; set; }
}

public class FileMetadata
{
    public FileMetadata(Guid id, string name, long size, string contentType, string storageKey)
    {
        Id = id;
        Name = name;
        Size = size;
        ContentType = contentType;
        StorageKey = storageKey;
    }

    public Guid Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public long Size { get; set; }
    public string ContentType { get; set; } = string.Empty;
    public string StorageKey { get; set; } = string.Empty;
}
