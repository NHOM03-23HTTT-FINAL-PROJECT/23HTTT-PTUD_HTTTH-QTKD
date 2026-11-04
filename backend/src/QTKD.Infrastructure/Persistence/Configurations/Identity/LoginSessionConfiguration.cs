using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using UserRole = QTKD.Domain.Identity.UserRole;
using UserStatus = QTKD.Domain.Identity.UserStatus;
using SessionEndReason = QTKD.Domain.Identity.SessionEndReason;
using RecordType = QTKD.Domain.Notifications.RecordType;
using SendStatus = QTKD.Domain.Notifications.SendStatus;
using QTKD.Infrastructure.Persistence.Schema;

namespace QTKD.Infrastructure.Persistence.Configurations.Identity;

/// <summary>qtkd.login_session. Names follow the original Prisma DDL; CHECKs, triggers and expression indexes live in migration SQL.</summary>
public sealed class LoginSessionConfiguration : IEntityTypeConfiguration<LoginSession>
{
    public void Configure(EntityTypeBuilder<LoginSession> b)
    {
        b.ToTable("login_session");
        b.HasKey(x => x.SessionId).HasName("login_session_pkey");
        b.Property(x => x.SessionId).HasColumnName("session_id").HasColumnType("uuid").HasDefaultValueSql("gen_random_uuid()");
        b.Property(x => x.UserId).HasColumnName("user_id").HasColumnType("uuid");
        b.Property(x => x.RefreshTokenHash).HasColumnName("refresh_token_hash").HasColumnType("character varying(256)");
        b.Property(x => x.LogoutTokenHash).HasColumnName("logout_token_hash").HasColumnType("character varying(256)");
        b.Property(x => x.CreatedAt).HasColumnName("created_at").HasColumnType("timestamp(6) with time zone").HasDefaultValueSql("CURRENT_TIMESTAMP");
        b.Property(x => x.LastActivityAt).HasColumnName("last_activity_at").HasColumnType("timestamp(6) with time zone").HasDefaultValueSql("CURRENT_TIMESTAMP");
        b.Property(x => x.Remember).HasColumnName("remember").HasDefaultValue(false);
        b.Property(x => x.RevocationReason).HasColumnName("revocation_reason").HasColumnType("character varying(50)");
        b.Property(x => x.ExpiresAt).HasColumnName("expires_at").HasColumnType("timestamp(6) with time zone");
        b.Property(x => x.IsRevoked).HasColumnName("is_revoked").HasDefaultValue(false);
        b.Property(x => x.EndReason).HasColumnName("end_reason");
        b.Property(x => x.IpAddress).HasColumnName("ip_address").HasColumnType("character varying(45)");
        b.Property(x => x.Device).HasColumnName("device").HasColumnType("character varying(500)");
        b.HasIndex(x => x.RefreshTokenHash).IsUnique().HasDatabaseName("login_session_refresh_token_hash_key");
        b.HasIndex(x => x.LogoutTokenHash).IsUnique().HasDatabaseName("login_session_logout_token_hash_key");
        b.HasIndex(x => x.UserId).HasDatabaseName("login_session_user_id_idx");
        b.HasIndex(x => new { x.UserId, x.IsRevoked, x.ExpiresAt }).HasDatabaseName("login_session_user_id_is_revoked_expires_at_idx");
        b.HasOne<UserAccount>().WithMany().HasForeignKey(x => x.UserId)
            .HasConstraintName("login_session_user_id_fkey").OnDelete(DeleteBehavior.Restrict);
    }
}
