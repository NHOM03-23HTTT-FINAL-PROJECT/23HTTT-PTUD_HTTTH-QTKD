using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using UserRole = QTKD.Domain.Identity.UserRole;
using UserStatus = QTKD.Domain.Identity.UserStatus;
using SessionEndReason = QTKD.Domain.Identity.SessionEndReason;
using RecordType = QTKD.Domain.Notifications.RecordType;
using SendStatus = QTKD.Domain.Notifications.SendStatus;
using QTKD.Infrastructure.Persistence.Schema;

namespace QTKD.Infrastructure.Persistence.Configurations.Contracts;

/// <summary>qtkd.contract_delivery. Names follow the original Prisma DDL; CHECKs, triggers and expression indexes live in migration SQL.</summary>
public sealed class ContractDeliveryConfiguration : IEntityTypeConfiguration<ContractDelivery>
{
    public void Configure(EntityTypeBuilder<ContractDelivery> b)
    {
        b.ToTable("contract_delivery");
        b.HasKey(x => x.DeliveryId).HasName("contract_delivery_pkey");
        b.Property(x => x.DeliveryId).HasColumnName("delivery_id").HasColumnType("uuid").HasDefaultValueSql("gen_random_uuid()");
        b.Property(x => x.ContractId).HasColumnName("contract_id").HasColumnType("uuid");
        b.Property(x => x.RequestId).HasColumnName("request_id").HasColumnType("uuid");
        b.Property(x => x.Destination).HasColumnName("destination").HasColumnType("character varying(254)");
        b.Property(x => x.Payload).HasColumnName("payload").HasColumnType("jsonb");
        b.Property(x => x.Status).HasColumnName("status").HasColumnType("character varying(20)").HasDefaultValue("Pending");
        b.Property(x => x.CreatedAt).HasColumnName("created_at").HasColumnType("timestamp(6) with time zone").HasDefaultValueSql("CURRENT_TIMESTAMP");
        b.Property(x => x.Attempts).HasColumnName("attempts").HasDefaultValue(0);
        b.Property(x => x.DeliveredAt).HasColumnName("delivered_at").HasColumnType("timestamp(6) with time zone");
        b.HasIndex(x => new { x.RequestId }).IsUnique().HasDatabaseName("contract_delivery_request_id_key");
        b.HasOne<Contract>().WithMany().HasForeignKey(x => x.ContractId)
            .HasConstraintName("contract_delivery_contract_id_fkey").OnDelete(DeleteBehavior.Restrict);
        b.HasOne<ContractCancellationRequest>().WithMany().HasForeignKey(x => x.RequestId)
            .HasConstraintName("contract_delivery_request_id_fkey").OnDelete(DeleteBehavior.Restrict);
    }
}
