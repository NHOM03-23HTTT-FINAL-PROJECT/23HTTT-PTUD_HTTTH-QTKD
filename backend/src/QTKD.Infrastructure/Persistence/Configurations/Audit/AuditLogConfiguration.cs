using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using UserRole = QTKD.Domain.Identity.UserRole;
using UserStatus = QTKD.Domain.Identity.UserStatus;
using SessionEndReason = QTKD.Domain.Identity.SessionEndReason;
using RecordType = QTKD.Domain.Notifications.RecordType;
using SendStatus = QTKD.Domain.Notifications.SendStatus;
using QTKD.Infrastructure.Persistence.Schema;

namespace QTKD.Infrastructure.Persistence.Configurations.Audit;

/// <summary>qtkd.audit_log. Names follow the original Prisma DDL; CHECKs, triggers and expression indexes live in migration SQL.</summary>
public sealed class AuditLogConfiguration : IEntityTypeConfiguration<AuditLog>
{
    public void Configure(EntityTypeBuilder<AuditLog> b)
    {
        b.ToTable("audit_log");
        b.HasKey(x => x.LogId).HasName("audit_log_pkey");
        b.Property(x => x.LogId).HasColumnName("log_id").HasColumnType("uuid").HasDefaultValueSql("gen_random_uuid()");
        b.Property(x => x.EntityType).HasColumnName("entity_type").HasColumnType("character varying(100)");
        b.Property(x => x.EntityId).HasColumnName("entity_id").HasColumnType("uuid");
        b.Property(x => x.Action).HasColumnName("action").HasColumnType("character varying(100)");
        b.Property(x => x.ActorId).HasColumnName("actor_id").HasColumnType("uuid");
        b.Property(x => x.ActedAt).HasColumnName("acted_at").HasColumnType("timestamp(6) with time zone").HasDefaultValueSql("CURRENT_TIMESTAMP");
        b.Property(x => x.StatusBefore).HasColumnName("status_before").HasColumnType("character varying(50)");
        b.Property(x => x.StatusAfter).HasColumnName("status_after").HasColumnType("character varying(50)");
        b.Property(x => x.ValueBefore).HasColumnName("value_before").HasColumnType("jsonb");
        b.Property(x => x.ValueAfter).HasColumnName("value_after").HasColumnType("jsonb");
        b.Property(x => x.Note).HasColumnName("note").HasColumnType("text");
        b.Property(x => x.IpAddress).HasColumnName("ip_address").HasColumnType("character varying(45)");
        b.HasIndex(x => x.ActorId).HasDatabaseName("audit_log_actor_id_idx");
        b.HasIndex(x => new { x.EntityType, x.EntityId, x.ActedAt }).HasDatabaseName("audit_log_entity_type_entity_id_acted_at_idx");
        b.HasOne<UserAccount>().WithMany().HasForeignKey(x => x.ActorId)
            .HasConstraintName("audit_log_actor_id_fkey").OnDelete(DeleteBehavior.Restrict);
    }
}
