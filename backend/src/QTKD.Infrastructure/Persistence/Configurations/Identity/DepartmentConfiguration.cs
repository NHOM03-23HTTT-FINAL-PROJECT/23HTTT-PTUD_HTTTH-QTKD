using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using UserRole = QTKD.Domain.Identity.UserRole;
using UserStatus = QTKD.Domain.Identity.UserStatus;
using SessionEndReason = QTKD.Domain.Identity.SessionEndReason;
using RecordType = QTKD.Domain.Notifications.RecordType;
using SendStatus = QTKD.Domain.Notifications.SendStatus;
using QTKD.Infrastructure.Persistence.Schema;

namespace QTKD.Infrastructure.Persistence.Configurations.Identity;

/// <summary>qtkd.department. Names follow the original Prisma DDL; CHECKs, triggers and expression indexes live in migration SQL.</summary>
public sealed class DepartmentConfiguration : IEntityTypeConfiguration<Department>
{
    public void Configure(EntityTypeBuilder<Department> b)
    {
        b.ToTable("department");
        b.HasKey(x => x.DepartmentId).HasName("department_pkey");
        b.Property(x => x.DepartmentId).HasColumnName("department_id").HasColumnType("uuid").HasDefaultValueSql("gen_random_uuid()");
        b.Property(x => x.DepartmentName).HasColumnName("department_name").HasColumnType("character varying(200)");
        b.Property(x => x.Code).HasColumnName("code").HasColumnType("character varying(16)");
        b.Property(x => x.ManagerId).HasColumnName("manager_id").HasColumnType("uuid");
        b.HasIndex(x => x.Code).IsUnique().HasDatabaseName("department_code_key");
        b.HasIndex(x => x.ManagerId).HasDatabaseName("department_manager_id_idx");
        b.HasOne<UserAccount>().WithMany().HasForeignKey(x => x.ManagerId)
            .HasConstraintName("department_manager_id_fkey").OnDelete(DeleteBehavior.Restrict);
    }
}
