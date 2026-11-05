using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using UserRole = QTKD.Domain.Identity.UserRole;
using UserStatus = QTKD.Domain.Identity.UserStatus;
using SessionEndReason = QTKD.Domain.Identity.SessionEndReason;
using RecordType = QTKD.Domain.Notifications.RecordType;
using SendStatus = QTKD.Domain.Notifications.SendStatus;
using QTKD.Infrastructure.Persistence.Schema;

namespace QTKD.Infrastructure.Persistence.Configurations.Contracts;

/// <summary>qtkd.contract_item. Names follow the original Prisma DDL; CHECKs, triggers and expression indexes live in migration SQL.</summary>
public sealed class ContractItemConfiguration : IEntityTypeConfiguration<ContractItem>
{
    public void Configure(EntityTypeBuilder<ContractItem> b)
    {
        b.ToTable("contract_item");
        b.HasKey(x => x.ItemId).HasName("contract_item_pkey");
        b.Property(x => x.ItemId).HasColumnName("item_id").HasColumnType("uuid").HasDefaultValueSql("gen_random_uuid()");
        b.Property(x => x.ContractId).HasColumnName("contract_id").HasColumnType("uuid");
        b.Property(x => x.ServiceId).HasColumnName("service_id").HasColumnType("uuid");
        b.Property(x => x.AreaId).HasColumnName("area_id").HasColumnType("uuid");
        b.Property(x => x.AreaNameSnapshot).HasColumnName("area_name_snapshot").HasColumnType("character varying(200)");
        // Recreated as NULLS NOT DISTINCT in 202611020004_contracts: one row per (contract, service) when area is null.
        b.HasIndex(x => new { x.ContractId, x.ServiceId, x.AreaId }).IsUnique().AreNullsDistinct(false)
            .HasDatabaseName("contract_item_contract_id_service_id_area_id_key");
        b.HasIndex(x => x.ContractId).HasDatabaseName("contract_item_contract_id_idx");
        b.HasIndex(x => x.ServiceId).HasDatabaseName("contract_item_service_id_idx");
        b.HasIndex(x => x.AreaId).HasDatabaseName("contract_item_area_id_idx");
        b.HasOne<Contract>().WithMany().HasForeignKey(x => x.ContractId)
            .HasConstraintName("contract_item_contract_id_fkey").OnDelete(DeleteBehavior.Restrict);
        b.HasOne<Service>().WithMany().HasForeignKey(x => x.ServiceId)
            .HasConstraintName("contract_item_service_id_fkey").OnDelete(DeleteBehavior.Restrict);
        b.HasOne<Area>().WithMany().HasForeignKey(x => x.AreaId)
            .HasConstraintName("contract_item_area_id_fkey").OnDelete(DeleteBehavior.Restrict);
    }
}
