using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using UserRole = QTKD.Domain.Identity.UserRole;
using UserStatus = QTKD.Domain.Identity.UserStatus;
using SessionEndReason = QTKD.Domain.Identity.SessionEndReason;
using RecordType = QTKD.Domain.Notifications.RecordType;
using SendStatus = QTKD.Domain.Notifications.SendStatus;
using QTKD.Infrastructure.Persistence.Schema;
using AreaService = QTKD.Domain.Entities.AreaService;
using Area = QTKD.Domain.Entities.Area;
using Service = QTKD.Domain.Entities.Service;

namespace QTKD.Infrastructure.Persistence.Configurations.Areas;

/// <summary>qtkd.area_service. Names follow the original Prisma DDL; CHECKs, triggers and expression indexes live in migration SQL.</summary>
public sealed class AreaServiceConfiguration : IEntityTypeConfiguration<AreaService>
{
    public void Configure(EntityTypeBuilder<AreaService> b)
    {
        b.ToTable("area_service");
        b.HasKey(x => new { x.AreaId, x.ServiceId }).HasName("area_service_pkey");
        b.Property(x => x.AreaId).HasColumnName("area_id").HasColumnType("uuid");
        b.Property(x => x.ServiceId).HasColumnName("service_id").HasColumnType("uuid");
        b.HasIndex(x => x.AreaId).HasDatabaseName("area_service_area_id_idx");
        b.HasIndex(x => x.ServiceId).HasDatabaseName("area_service_service_id_idx");
        b.HasOne(x => x.Area).WithMany(a => a.AreaServices).HasForeignKey(x => x.AreaId)
            .HasConstraintName("area_service_area_id_fkey").OnDelete(DeleteBehavior.Restrict);
        b.HasOne(x => x.Service).WithMany(s => s.AreaServices).HasForeignKey(x => x.ServiceId)
            .HasConstraintName("area_service_service_id_fkey").OnDelete(DeleteBehavior.Restrict);
    }
}
