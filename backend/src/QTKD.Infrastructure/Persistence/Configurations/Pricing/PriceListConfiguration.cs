using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using UserRole = QTKD.Domain.Identity.UserRole;
using UserStatus = QTKD.Domain.Identity.UserStatus;
using SessionEndReason = QTKD.Domain.Identity.SessionEndReason;
using RecordType = QTKD.Domain.Notifications.RecordType;
using SendStatus = QTKD.Domain.Notifications.SendStatus;
using QTKD.Infrastructure.Persistence.Schema;

namespace QTKD.Infrastructure.Persistence.Configurations.Pricing;

/// <summary>qtkd.price_list. Names follow the original Prisma DDL; CHECKs, triggers and expression indexes live in migration SQL.</summary>
public sealed class PriceListConfiguration : IEntityTypeConfiguration<PriceList>
{
    public void Configure(EntityTypeBuilder<PriceList> b)
    {
        b.ToTable("price_list");
        b.HasKey(x => x.PriceListId).HasName("price_list_pkey");
        b.Property(x => x.PriceListId).HasColumnName("price_list_id").HasColumnType("uuid").HasDefaultValueSql("gen_random_uuid()");
        b.Property(x => x.ContractId).HasColumnName("contract_id").HasColumnType("uuid");
        b.Property(x => x.Version).HasColumnName("version").HasDefaultValue(1);
        b.Property(x => x.EffectiveFrom).HasColumnName("effective_from").HasColumnType("date");
        b.Property(x => x.EffectiveTo).HasColumnName("effective_to").HasColumnType("date");
        b.Property(x => x.Status).HasColumnName("status").HasDefaultValue(PriceListStatus.Draft);
        b.Property(x => x.CreatedBy).HasColumnName("created_by").HasColumnType("uuid");
        b.HasIndex(x => new { x.ContractId, x.Version }).IsUnique().HasDatabaseName("price_list_contract_id_version_key");
        b.HasIndex(x => x.ContractId).HasDatabaseName("price_list_contract_id_idx");
        b.HasIndex(x => x.CreatedBy).HasDatabaseName("price_list_created_by_idx");
        b.HasOne<Contract>().WithMany().HasForeignKey(x => x.ContractId)
            .HasConstraintName("price_list_contract_id_fkey").OnDelete(DeleteBehavior.Restrict);
        b.HasOne<UserAccount>().WithMany().HasForeignKey(x => x.CreatedBy)
            .HasConstraintName("price_list_created_by_fkey").OnDelete(DeleteBehavior.Restrict);
    }
}
