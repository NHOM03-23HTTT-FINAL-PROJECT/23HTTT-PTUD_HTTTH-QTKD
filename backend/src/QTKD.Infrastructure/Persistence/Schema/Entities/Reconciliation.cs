using UserRole = QTKD.Domain.Identity.UserRole;
using UserStatus = QTKD.Domain.Identity.UserStatus;
using SessionEndReason = QTKD.Domain.Identity.SessionEndReason;
using RecordType = QTKD.Domain.Notifications.RecordType;
using SendStatus = QTKD.Domain.Notifications.SendStatus;

namespace QTKD.Infrastructure.Persistence.Schema;

/// <summary>qtkd.reconciliation</summary>
public sealed class Reconciliation
{
    public Guid ReconciliationId { get; set; }
    public Guid StatementId { get; set; }
    public Guid? VolumeConfirmedBy { get; set; }
    public DateTime? VolumeConfirmedAt { get; set; }
    public string? DiscrepancyNote { get; set; }
    public DateTime? SentToCustomerAt { get; set; }
    public CustomerResult? CustomerResult { get; set; }
    public string? CustomerFeedback { get; set; }
    public Guid? ReconciledBy { get; set; }
    public DateTime? CompletedAt { get; set; }
    public DateTime? PriceConfirmedAt { get; set; }
    public string? PriceMismatchNote { get; set; }
}
