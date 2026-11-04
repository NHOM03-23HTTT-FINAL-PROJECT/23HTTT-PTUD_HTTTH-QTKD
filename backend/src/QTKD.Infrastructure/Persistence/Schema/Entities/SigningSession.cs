using UserRole = QTKD.Domain.Identity.UserRole;
using UserStatus = QTKD.Domain.Identity.UserStatus;
using SessionEndReason = QTKD.Domain.Identity.SessionEndReason;
using RecordType = QTKD.Domain.Notifications.RecordType;
using SendStatus = QTKD.Domain.Notifications.SendStatus;

namespace QTKD.Infrastructure.Persistence.Schema;

/// <summary>qtkd.signing_session</summary>
public sealed class SigningSession
{
    public Guid SigningSessionId { get; set; }
    public DocumentRecordType RecordType { get; set; }
    public Guid? ContractId { get; set; }
    public Guid? StatementId { get; set; }
    public string ProviderSessionId { get; set; } = "";
    public SigningStatus Status { get; set; }
    public string? Reason { get; set; }
    public Guid CompanySignerId { get; set; }
    public DateTime? CompanySignedAt { get; set; }
    public string CustomerSignerName { get; set; } = "";
    public string CustomerSignerEmail { get; set; } = "";
    public DateTime? CustomerSignedAt { get; set; }
    public Guid? SignedFileId { get; set; }
    public Guid SentBy { get; set; }
    public DateTime SentAt { get; set; }
    public DateTime? ResultAt { get; set; }
}
