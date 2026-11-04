namespace QTKD.Domain.Notifications;

/// <summary>Entity of qtkd.notification: an in-app message delivered to one recipient.</summary>
public sealed class Notification
{
    public Guid NotificationId { get; set; }
    public Guid RecipientId { get; set; }
    public RecordType RecordType { get; set; }
    public Guid RecordId { get; set; }
    public string Content { get; set; } = "";
    public bool IsRead { get; set; }
    public SendStatus SendStatus { get; set; }
    public DateTime CreatedAt { get; set; }
}

/// <summary>Values of PostgreSQL enum qtkd.record_type. Names must match the database labels exactly.</summary>
public enum RecordType { Contract, PaymentStatement, Customer, Area, PriceList, VolumePeriod, UserAccount }

/// <summary>Values of PostgreSQL enum qtkd.send_status.</summary>
public enum SendStatus { Pending, Sent, Failed }
