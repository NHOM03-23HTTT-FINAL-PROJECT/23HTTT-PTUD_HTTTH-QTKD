using UserRole = QTKD.Domain.Identity.UserRole;
using UserStatus = QTKD.Domain.Identity.UserStatus;
using SessionEndReason = QTKD.Domain.Identity.SessionEndReason;
using RecordType = QTKD.Domain.Notifications.RecordType;
using SendStatus = QTKD.Domain.Notifications.SendStatus;

namespace QTKD.Infrastructure.Persistence.Schema;

/// <summary>qtkd.customer</summary>
public sealed class Customer
{
    public string CustomerCode { get; set; } = "";
    public Guid CustomerId { get; set; }
    public string CustomerName { get; set; } = "";
    public string TaxCode { get; set; } = "";
    public string Address { get; set; } = "";
    public string LegalRepresentative { get; set; } = "";
    public string? ContactName { get; set; }
    public string? ContactTitle { get; set; }
    public string? Phone { get; set; }
    public string? Email { get; set; }
    public string? CustomerGroup { get; set; }
    public string? InterestedServices { get; set; }
    public ActiveStatus Status { get; set; }
    public Guid AccountManagerId { get; set; }
    public int Version { get; set; }
}
