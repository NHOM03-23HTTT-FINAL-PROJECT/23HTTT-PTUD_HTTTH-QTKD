using UserRole = QTKD.Domain.Identity.UserRole;
using UserStatus = QTKD.Domain.Identity.UserStatus;
using SessionEndReason = QTKD.Domain.Identity.SessionEndReason;
using RecordType = QTKD.Domain.Notifications.RecordType;
using SendStatus = QTKD.Domain.Notifications.SendStatus;

namespace QTKD.Infrastructure.Persistence.Schema;

/// <summary>qtkd.approval_round</summary>
public sealed class ApprovalRound
{
    public Guid RoundId { get; set; }
    public DocumentRecordType RecordType { get; set; }
    public Guid? ContractId { get; set; }
    public Guid? StatementId { get; set; }
    public int RecordVersion { get; set; }
    public int RoundNo { get; set; }
    public Guid SubmittedBy { get; set; }
    public DateTime SubmittedAt { get; set; }
    public ApprovalResult Result { get; set; }
    public DateTime? EndedAt { get; set; }
    public string RecordSnapshot { get; set; } = "";
}
