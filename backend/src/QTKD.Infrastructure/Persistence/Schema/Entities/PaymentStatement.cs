using UserRole = QTKD.Domain.Identity.UserRole;
using UserStatus = QTKD.Domain.Identity.UserStatus;
using SessionEndReason = QTKD.Domain.Identity.SessionEndReason;
using RecordType = QTKD.Domain.Notifications.RecordType;
using SendStatus = QTKD.Domain.Notifications.SendStatus;

namespace QTKD.Infrastructure.Persistence.Schema;

/// <summary>qtkd.payment_statement</summary>
public sealed class PaymentStatement
{
    public Guid StatementId { get; set; }
    public Guid ContractId { get; set; }
    public string BillingPeriod { get; set; } = "";
    public Guid PriceListId { get; set; }
    public Guid VolumePeriodId { get; set; }
    public string CustomerNameSnapshot { get; set; } = "";
    public string TaxCodeSnapshot { get; set; } = "";
    public string AddressSnapshot { get; set; } = "";
    public string RepresentativeSnapshot { get; set; } = "";
    public decimal Subtotal { get; set; }
    public decimal TaxAmount { get; set; }
    public decimal TotalAmount { get; set; }
    public PaymentStatus Status { get; set; }
    public Guid? OriginalStatementId { get; set; }
    public Guid CreatedBy { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime? IssuedAt { get; set; }
    public bool IsLocked { get; set; }
}
