using UserRole = QTKD.Domain.Identity.UserRole;
using UserStatus = QTKD.Domain.Identity.UserStatus;
using SessionEndReason = QTKD.Domain.Identity.SessionEndReason;
using RecordType = QTKD.Domain.Notifications.RecordType;
using SendStatus = QTKD.Domain.Notifications.SendStatus;

namespace QTKD.Infrastructure.Persistence.Schema;

/// <summary>qtkd.change_request</summary>
public sealed class ChangeRequest
{
    public Guid RequestId { get; set; }
    public ChangeRequestType RequestType { get; set; }
    public DocumentRecordType RecordType { get; set; }
    public Guid? ContractId { get; set; }
    public Guid? StatementId { get; set; }
    public string Reason { get; set; } = "";
    public ChangeRequestStatus Status { get; set; }
    public Guid RequestedBy { get; set; }
    public DateTime RequestedAt { get; set; }
    public Guid? ApprovedBy { get; set; }
    public string? ApproverComment { get; set; }
    public DateTime? DecidedAt { get; set; }
}
