using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using UserRole = QTKD.Domain.Identity.UserRole;
using UserStatus = QTKD.Domain.Identity.UserStatus;
using SessionEndReason = QTKD.Domain.Identity.SessionEndReason;
using RecordType = QTKD.Domain.Notifications.RecordType;
using SendStatus = QTKD.Domain.Notifications.SendStatus;
using QTKD.Infrastructure.Persistence.Schema;

namespace QTKD.Infrastructure.Persistence.Configurations.Areas;

/// <summary>qtkd.area. Names follow the original Prisma DDL; CHECKs, triggers and expression indexes live in migration SQL.</summary>
public sealed class AreaConfiguration : IEntityTypeConfiguration<Area>
{
    public void Configure(EntityTypeBuilder<Area> b)
    {
        b.ToTable("area");
        b.HasKey(x => x.AreaId).HasName("area_pkey");
        b.Property(x => x.AreaId).HasColumnName("area_id").HasColumnType("uuid").HasDefaultValueSql("gen_random_uuid()");
        b.Property(x => x.AreaCode).HasColumnName("area_code").HasColumnType("character varying(50)");
        b.Property(x => x.AreaName).HasColumnName("area_name").HasColumnType("character varying(200)");
        b.Property(x => x.AreaType).HasColumnName("area_type").HasColumnType("character varying(100)");
        b.Property(x => x.ParentAreaId).HasColumnName("parent_area_id").HasColumnType("uuid");
        b.Property(x => x.Level).HasColumnName("level").HasDefaultValue(1);
        b.Property(x => x.HierarchyPath).HasColumnName("hierarchy_path").HasColumnType("text");
        b.Property(x => x.Coordinates).HasColumnName("coordinates").HasColumnType("text");
        b.Property(x => x.AreaM2).HasColumnName("area_m2").HasColumnType("numeric(19,4)");
        b.Property(x => x.Capacity).HasColumnName("capacity").HasColumnType("numeric(19,4)");
        b.Property(x => x.TechnicalDescription).HasColumnName("technical_description").HasColumnType("text");
        b.Property(x => x.Status).HasColumnName("status").HasDefaultValue(ActiveStatus.Active);
        b.Property(x => x.RowVersion).HasColumnName("row_version").HasDefaultValue(1);
        b.HasIndex(x => x.AreaCode).IsUnique().HasDatabaseName("area_area_code_key");
        b.HasIndex(x => x.ParentAreaId).HasDatabaseName("area_parent_area_id_idx");
        b.HasOne<Area>().WithMany().HasForeignKey(x => x.ParentAreaId)
            .HasConstraintName("area_parent_area_id_fkey").OnDelete(DeleteBehavior.Restrict);
    }
}
