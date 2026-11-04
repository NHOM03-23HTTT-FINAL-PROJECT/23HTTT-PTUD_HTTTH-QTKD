using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using UserRole = QTKD.Domain.Identity.UserRole;
using UserStatus = QTKD.Domain.Identity.UserStatus;
using SessionEndReason = QTKD.Domain.Identity.SessionEndReason;
using RecordType = QTKD.Domain.Notifications.RecordType;
using SendStatus = QTKD.Domain.Notifications.SendStatus;
using QTKD.Infrastructure.Persistence.Schema;

namespace QTKD.Infrastructure.Persistence.Configurations.Notifications;

/// <summary>qtkd.notification. Names follow the original Prisma DDL; CHECKs, triggers and expression indexes live in migration SQL.</summary>
public sealed class NotificationConfiguration : IEntityTypeConfiguration<QTKD.Domain.Notifications.Notification>
{
    public void Configure(EntityTypeBuilder<QTKD.Domain.Notifications.Notification> b)
    {
        b.ToTable("notification");
        b.HasKey(x => x.NotificationId).HasName("notification_pkey");
        b.Property(x => x.NotificationId).HasColumnName("notification_id").HasColumnType("uuid").HasDefaultValueSql("gen_random_uuid()");
        b.Property(x => x.RecipientId).HasColumnName("recipient_id").HasColumnType("uuid");
        b.Property(x => x.RecordType).HasColumnName("record_type");
        b.Property(x => x.RecordId).HasColumnName("record_id").HasColumnType("uuid");
        b.Property(x => x.Content).HasColumnName("content").HasColumnType("text");
        b.Property(x => x.IsRead).HasColumnName("is_read").HasDefaultValue(false);
        b.Property(x => x.SendStatus).HasColumnName("send_status").HasDefaultValue(SendStatus.Pending);
        b.Property(x => x.CreatedAt).HasColumnName("created_at").HasColumnType("timestamp(6) with time zone").HasDefaultValueSql("CURRENT_TIMESTAMP");
        b.HasIndex(x => x.RecipientId).HasDatabaseName("notification_recipient_id_idx");
        b.HasIndex(x => new { x.RecipientId, x.IsRead, x.CreatedAt }).HasDatabaseName("notification_recipient_id_is_read_created_at_idx");
        b.HasIndex(x => new { x.SendStatus, x.CreatedAt }).HasDatabaseName("notification_send_status_created_at_idx");
        b.HasOne<UserAccount>().WithMany().HasForeignKey(x => x.RecipientId)
            .HasConstraintName("notification_recipient_id_fkey").OnDelete(DeleteBehavior.Restrict);
    }
}
