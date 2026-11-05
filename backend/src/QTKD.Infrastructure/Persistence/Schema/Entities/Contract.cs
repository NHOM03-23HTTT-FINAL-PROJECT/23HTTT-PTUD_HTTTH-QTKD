using UserRole = QTKD.Domain.Identity.UserRole;
using UserStatus = QTKD.Domain.Identity.UserStatus;
using SessionEndReason = QTKD.Domain.Identity.SessionEndReason;
using RecordType = QTKD.Domain.Notifications.RecordType;
using SendStatus = QTKD.Domain.Notifications.SendStatus;

namespace QTKD.Infrastructure.Persistence.Schema;

/// <summary>qtkd.contract</summary>
public sealed class Contract
{
    public string ContractCode { get; set; } = "";
    public string SourceMode { get; set; } = "";
    public string? TemplateCode { get; set; }
    public string CustomerSnapshot { get; set; } = "";
    public Guid? OwningDepartmentId { get; set; }
    public Guid? CancelledBy { get; set; }
    public DateTime? CancelledAt { get; set; }
    public string? CancellationReason { get; set; }
    public Guid ContractId { get; set; }
    public ContractDocumentType DocumentType { get; set; }
    public Guid? ParentContractId { get; set; }
    public Guid CustomerId { get; set; }
    public string Title { get; set; } = "";
    public string ContractType { get; set; } = "";
    public DateOnly StartDate { get; set; }
    public DateOnly EndDate { get; set; }
    public decimal ContractValue { get; set; }
    public string PaymentTerms { get; set; } = "";
    public string Content { get; set; } = "";
    public ContractStatus Status { get; set; }
    public Guid OwnerId { get; set; }
    public int Version { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}
