using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using UserRole = QTKD.Domain.Identity.UserRole;
using UserStatus = QTKD.Domain.Identity.UserStatus;
using SessionEndReason = QTKD.Domain.Identity.SessionEndReason;
using RecordType = QTKD.Domain.Notifications.RecordType;
using SendStatus = QTKD.Domain.Notifications.SendStatus;
using QTKD.Infrastructure.Persistence.Schema;

namespace QTKD.Infrastructure.Persistence.Configurations.Contracts;

/// <summary>qtkd.idempotency_request. Names follow the original Prisma DDL; CHECKs, triggers and expression indexes live in migration SQL.</summary>
public sealed class IdempotencyRequestConfiguration : IEntityTypeConfiguration<IdempotencyRequest>
{
    public void Configure(EntityTypeBuilder<IdempotencyRequest> b)
    {
        b.ToTable("idempotency_request");
        b.HasKey(x => new { x.ActorId, x.Operation, x.Key }).HasName("idempotency_request_pkey");
        b.Property(x => x.ActorId).HasColumnName("actor_id").HasColumnType("uuid");
        b.Property(x => x.Operation).HasColumnName("operation").HasColumnType("character varying(180)");
        b.Property(x => x.Key).HasColumnName("key").HasColumnType("character varying(128)");
        b.Property(x => x.Fingerprint).HasColumnName("fingerprint").HasColumnType("character varying(64)");
        b.Property(x => x.Response).HasColumnName("response").HasColumnType("jsonb");
        b.Property(x => x.CreatedAt).HasColumnName("created_at").HasColumnType("timestamp(6) with time zone").HasDefaultValueSql("CURRENT_TIMESTAMP");
    }
}
