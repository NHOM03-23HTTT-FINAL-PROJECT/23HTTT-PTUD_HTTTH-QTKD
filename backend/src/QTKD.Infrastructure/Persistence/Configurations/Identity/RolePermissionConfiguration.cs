using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using UserRole = QTKD.Domain.Identity.UserRole;
using UserStatus = QTKD.Domain.Identity.UserStatus;
using SessionEndReason = QTKD.Domain.Identity.SessionEndReason;
using RecordType = QTKD.Domain.Notifications.RecordType;
using SendStatus = QTKD.Domain.Notifications.SendStatus;
using QTKD.Infrastructure.Persistence.Schema;

namespace QTKD.Infrastructure.Persistence.Configurations.Identity;

/// <summary>qtkd.role_permission. Names follow the original Prisma DDL; CHECKs, triggers and expression indexes live in migration SQL.</summary>
public sealed class RolePermissionConfiguration : IEntityTypeConfiguration<RolePermission>
{
    public void Configure(EntityTypeBuilder<RolePermission> b)
    {
        b.ToTable("role_permission");
        b.HasKey(x => new { x.Role, x.PermissionCode }).HasName("role_permission_pkey");
        b.Property(x => x.Role).HasColumnName("role");
        b.Property(x => x.PermissionCode).HasColumnName("permission_code").HasColumnType("character varying(100)");
        b.HasOne<RoleDefinition>().WithMany().HasForeignKey(x => x.Role)
            .HasConstraintName("role_permission_role_fkey").OnDelete(DeleteBehavior.Restrict);
        b.HasOne<Permission>().WithMany().HasForeignKey(x => x.PermissionCode)
            .HasConstraintName("role_permission_permission_code_fkey").OnDelete(DeleteBehavior.Restrict);
    }
}
