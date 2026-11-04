using UserRole = QTKD.Domain.Identity.UserRole;
using UserStatus = QTKD.Domain.Identity.UserStatus;
using SessionEndReason = QTKD.Domain.Identity.SessionEndReason;
using RecordType = QTKD.Domain.Notifications.RecordType;
using SendStatus = QTKD.Domain.Notifications.SendStatus;

namespace QTKD.Infrastructure.Persistence.Schema;

/// <summary>qtkd.approval_step</summary>
public sealed class ApprovalStep
{
    public Guid StepId { get; set; }
    public Guid RoundId { get; set; }
    public string StepName { get; set; } = "";
    public int StepOrder { get; set; }
    public Guid? AssigneeId { get; set; }
    public DateTime? AssignedAt { get; set; }
    public DateTime? AcceptedAt { get; set; }
    public ApprovalStepStatus StepStatus { get; set; }
    public ApprovalDecision? Decision { get; set; }
    public string? Comment { get; set; }
    public string? LegalConclusion { get; set; }
    public Guid? DecidedBy { get; set; }
    public DateTime? DecidedAt { get; set; }
}
