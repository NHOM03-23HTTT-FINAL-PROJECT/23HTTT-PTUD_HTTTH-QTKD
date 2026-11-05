using UserRole = QTKD.Domain.Identity.UserRole;
using UserStatus = QTKD.Domain.Identity.UserStatus;
using SessionEndReason = QTKD.Domain.Identity.SessionEndReason;
using RecordType = QTKD.Domain.Notifications.RecordType;
using SendStatus = QTKD.Domain.Notifications.SendStatus;

namespace QTKD.Infrastructure.Persistence.Schema;

/// <summary>qtkd.attachment</summary>
public sealed class Attachment
{
    public long FileSize { get; set; }
    public string ContentType { get; set; } = "";
    public Guid AttachmentId { get; set; }
    public DocumentRecordType RecordType { get; set; }
    public Guid? ContractId { get; set; }
    public Guid? StatementId { get; set; }
    public string FileName { get; set; } = "";
    public string FilePath { get; set; } = "";
    public Guid UploadedBy { get; set; }
    public DateTime UploadedAt { get; set; }
}
