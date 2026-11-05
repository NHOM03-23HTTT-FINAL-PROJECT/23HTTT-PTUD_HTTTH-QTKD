using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using UserRole = QTKD.Domain.Identity.UserRole;
using UserStatus = QTKD.Domain.Identity.UserStatus;
using SessionEndReason = QTKD.Domain.Identity.SessionEndReason;
using RecordType = QTKD.Domain.Notifications.RecordType;
using SendStatus = QTKD.Domain.Notifications.SendStatus;
using QTKD.Infrastructure.Persistence.Schema;
using AreaAssignment = QTKD.Domain.Entities.AreaAssignment;
using Area = QTKD.Domain.Entities.Area;

namespace QTKD.Infrastructure.Persistence.Configurations.Areas;

/// <summary>qtkd.area_assignment. Names follow the original Prisma DDL; CHECKs, triggers and expression indexes live in migration SQL.</summary>
public sealed class AreaAssignmentConfiguration : IEntityTypeConfiguration<AreaAssignment>
{
    public void Configure(EntityTypeBuilder<AreaAssignment> b)
    {
        b.ToTable("area_assignment");
        b.HasKey(x => x.AssignmentId).HasName("area_assignment_pkey");
        b.Property(x => x.AssignmentId).HasColumnName("assignment_id").HasColumnType("uuid").HasDefaultValueSql("gen_random_uuid()");
        b.Property(x => x.AreaId).HasColumnName("area_id").HasColumnType("uuid");
        b.Property(x => x.UserId).HasColumnName("user_id").HasColumnType("uuid");
        b.Property(x => x.FromDate).HasColumnName("from_date").HasColumnType("timestamp(6) with time zone");
        b.Property(x => x.ToDate).HasColumnName("to_date").HasColumnType("timestamp(6) with time zone");
        b.HasIndex(x => x.AreaId).HasDatabaseName("area_assignment_area_id_idx");
        b.HasIndex(x => x.UserId).HasDatabaseName("area_assignment_user_id_idx");
        b.HasOne(x => x.Area).WithMany(a => a.AreaAssignments).HasForeignKey(x => x.AreaId)
            .HasConstraintName("area_assignment_area_id_fkey").OnDelete(DeleteBehavior.Restrict);
        b.HasOne<UserAccount>().WithMany().HasForeignKey(x => x.UserId)
            .HasConstraintName("area_assignment_user_id_fkey").OnDelete(DeleteBehavior.Restrict);
    }
}
