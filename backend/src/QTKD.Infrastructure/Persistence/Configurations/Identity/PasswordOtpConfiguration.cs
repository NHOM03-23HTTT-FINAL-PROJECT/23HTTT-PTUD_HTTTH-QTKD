using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using UserRole = QTKD.Domain.Identity.UserRole;
using UserStatus = QTKD.Domain.Identity.UserStatus;
using SessionEndReason = QTKD.Domain.Identity.SessionEndReason;
using RecordType = QTKD.Domain.Notifications.RecordType;
using SendStatus = QTKD.Domain.Notifications.SendStatus;
using QTKD.Infrastructure.Persistence.Schema;

namespace QTKD.Infrastructure.Persistence.Configurations.Identity;

/// <summary>qtkd.password_otp. Names follow the original Prisma DDL; CHECKs, triggers and expression indexes live in migration SQL.</summary>
public sealed class PasswordOtpConfiguration : IEntityTypeConfiguration<PasswordOtp>
{
    public void Configure(EntityTypeBuilder<PasswordOtp> b)
    {
        b.ToTable("password_otp");
        b.HasKey(x => x.OtpId).HasName("password_otp_pkey");
        b.Property(x => x.OtpId).HasColumnName("otp_id").HasColumnType("uuid").HasDefaultValueSql("gen_random_uuid()");
        b.Property(x => x.UserId).HasColumnName("user_id").HasColumnType("uuid");
        b.Property(x => x.OtpHash).HasColumnName("otp_hash").HasColumnType("character varying(256)");
        b.Property(x => x.ExpiresAt).HasColumnName("expires_at").HasColumnType("timestamp(6) with time zone");
        b.Property(x => x.FailedCount).HasColumnName("failed_count").HasDefaultValue(0);
        b.Property(x => x.IsUsed).HasColumnName("is_used").HasDefaultValue(false);
        b.Property(x => x.SentAt).HasColumnName("sent_at").HasColumnType("timestamp(6) with time zone").HasDefaultValueSql("CURRENT_TIMESTAMP");
        b.HasIndex(x => x.UserId).HasDatabaseName("password_otp_user_id_idx");
        b.HasIndex(x => new { x.UserId, x.SentAt }).HasDatabaseName("password_otp_user_id_sent_at_idx");
        b.HasOne<UserAccount>().WithMany().HasForeignKey(x => x.UserId)
            .HasConstraintName("password_otp_user_id_fkey").OnDelete(DeleteBehavior.Restrict);
    }
}
