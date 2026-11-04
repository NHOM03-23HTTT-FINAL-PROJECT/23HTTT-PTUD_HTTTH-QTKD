using UserRole = QTKD.Domain.Identity.UserRole;
using UserStatus = QTKD.Domain.Identity.UserStatus;
using SessionEndReason = QTKD.Domain.Identity.SessionEndReason;
using RecordType = QTKD.Domain.Notifications.RecordType;
using SendStatus = QTKD.Domain.Notifications.SendStatus;

namespace QTKD.Infrastructure.Persistence.Schema;

/// <summary>qtkd.contract_cancellation_request</summary>
public sealed class ContractCancellationRequest
{
    public Guid RequestId { get; set; }
    public Guid ContractId { get; set; }
    public Guid RequestedBy { get; set; }
    public DateTime RequestedAt { get; set; }
    public string Party { get; set; } = "";
    public string Reason { get; set; } = "";
    public ContractStatus OriginalStatus { get; set; }
    public int ContractVersion { get; set; }
    public string Status { get; set; } = "";
    public Guid SalesAssigneeId { get; set; }
    public DateTime? SalesDecidedAt { get; set; }
    public bool? SalesApproved { get; set; }
    public string? SalesReason { get; set; }
    public Guid? BoardAssigneeId { get; set; }
    public DateTime? BoardDecidedAt { get; set; }
    public bool? BoardApproved { get; set; }
    public string? BoardReason { get; set; }
    public int Version { get; set; }
}
