using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using UserRole = QTKD.Domain.Identity.UserRole;
using UserStatus = QTKD.Domain.Identity.UserStatus;
using SessionEndReason = QTKD.Domain.Identity.SessionEndReason;
using RecordType = QTKD.Domain.Notifications.RecordType;
using SendStatus = QTKD.Domain.Notifications.SendStatus;
using QTKD.Infrastructure.Persistence.Schema;

namespace QTKD.Infrastructure.Persistence.Configurations.Pricing;

/// <summary>qtkd.volume_line. Names follow the original Prisma DDL; CHECKs, triggers and expression indexes live in migration SQL.</summary>
public sealed class VolumeLineConfiguration : IEntityTypeConfiguration<VolumeLine>
{
    public void Configure(EntityTypeBuilder<VolumeLine> b)
    {
        b.ToTable("volume_line");
        b.HasKey(x => x.VolumeLineId).HasName("volume_line_pkey");
        b.Property(x => x.VolumeLineId).HasColumnName("volume_line_id").HasColumnType("uuid").HasDefaultValueSql("gen_random_uuid()");
        b.Property(x => x.VolumePeriodId).HasColumnName("volume_period_id").HasColumnType("uuid");
        b.Property(x => x.ServiceId).HasColumnName("service_id").HasColumnType("uuid");
        b.Property(x => x.AreaId).HasColumnName("area_id").HasColumnType("uuid");
        b.Property(x => x.Quantity).HasColumnName("quantity").HasColumnType("numeric(19,4)");
        b.HasIndex(x => x.VolumePeriodId).HasDatabaseName("volume_line_volume_period_id_idx");
        b.HasIndex(x => x.ServiceId).HasDatabaseName("volume_line_service_id_idx");
        b.HasIndex(x => x.AreaId).HasDatabaseName("volume_line_area_id_idx");
        b.HasOne<VolumePeriod>().WithMany().HasForeignKey(x => x.VolumePeriodId)
            .HasConstraintName("volume_line_volume_period_id_fkey").OnDelete(DeleteBehavior.Restrict);
        b.HasOne<QTKD.Domain.Entities.Service>().WithMany().HasForeignKey(x => x.ServiceId)
            .HasConstraintName("volume_line_service_id_fkey").OnDelete(DeleteBehavior.Restrict);
        b.HasOne<QTKD.Domain.Entities.Area>().WithMany().HasForeignKey(x => x.AreaId)
            .HasConstraintName("volume_line_area_id_fkey").OnDelete(DeleteBehavior.Restrict);
    }
}
