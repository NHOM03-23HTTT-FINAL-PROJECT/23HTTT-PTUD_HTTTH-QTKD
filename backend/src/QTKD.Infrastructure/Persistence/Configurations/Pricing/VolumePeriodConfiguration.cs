using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using UserRole = QTKD.Domain.Identity.UserRole;
using UserStatus = QTKD.Domain.Identity.UserStatus;
using SessionEndReason = QTKD.Domain.Identity.SessionEndReason;
using RecordType = QTKD.Domain.Notifications.RecordType;
using SendStatus = QTKD.Domain.Notifications.SendStatus;
using QTKD.Infrastructure.Persistence.Schema;

namespace QTKD.Infrastructure.Persistence.Configurations.Pricing;

/// <summary>qtkd.volume_period. Names follow the original Prisma DDL; CHECKs, triggers and expression indexes live in migration SQL.</summary>
public sealed class VolumePeriodConfiguration : IEntityTypeConfiguration<VolumePeriod>
{
    public void Configure(EntityTypeBuilder<VolumePeriod> b)
    {
        b.ToTable("volume_period");
        b.HasKey(x => x.VolumePeriodId).HasName("volume_period_pkey");
        b.Property(x => x.VolumePeriodId).HasColumnName("volume_period_id").HasColumnType("uuid").HasDefaultValueSql("gen_random_uuid()");
        b.Property(x => x.ContractId).HasColumnName("contract_id").HasColumnType("uuid");
        b.Property(x => x.BillingPeriod).HasColumnName("billing_period").HasColumnType("character varying(7)");
        b.Property(x => x.Status).HasColumnName("status").HasDefaultValue(VolumeStatus.Draft);
        b.Property(x => x.LockedBy).HasColumnName("locked_by").HasColumnType("uuid");
        b.Property(x => x.LockedAt).HasColumnName("locked_at").HasColumnType("timestamp(6) with time zone");
        b.HasIndex(x => new { x.ContractId, x.BillingPeriod }).IsUnique().HasDatabaseName("volume_period_contract_id_billing_period_key");
        b.HasIndex(x => x.ContractId).HasDatabaseName("volume_period_contract_id_idx");
        b.HasIndex(x => x.LockedBy).HasDatabaseName("volume_period_locked_by_idx");
        b.HasOne<Contract>().WithMany().HasForeignKey(x => x.ContractId)
            .HasConstraintName("volume_period_contract_id_fkey").OnDelete(DeleteBehavior.Restrict);
        b.HasOne<UserAccount>().WithMany().HasForeignKey(x => x.LockedBy)
            .HasConstraintName("volume_period_locked_by_fkey").OnDelete(DeleteBehavior.Restrict);
    }
}
