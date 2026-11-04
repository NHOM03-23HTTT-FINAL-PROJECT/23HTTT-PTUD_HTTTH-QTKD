using UserRole = QTKD.Domain.Identity.UserRole;
using UserStatus = QTKD.Domain.Identity.UserStatus;
using SessionEndReason = QTKD.Domain.Identity.SessionEndReason;
using RecordType = QTKD.Domain.Notifications.RecordType;
using SendStatus = QTKD.Domain.Notifications.SendStatus;

namespace QTKD.Infrastructure.Persistence.Schema;

/// <summary>qtkd.customer_status_decision</summary>
public sealed class CustomerStatusDecision
{
    public Guid DecisionId { get; set; }
    public Guid CustomerId { get; set; }
    public CustomerDecisionType DecisionType { get; set; }
    public string Reason { get; set; } = "";
    public string? Basis { get; set; }
    public string? FollowUpPlan { get; set; }
    public Guid ConfirmedBy { get; set; }
    public DateTime DecidedAt { get; set; }
}
