using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using UserRole = QTKD.Domain.Identity.UserRole;
using UserStatus = QTKD.Domain.Identity.UserStatus;
using SessionEndReason = QTKD.Domain.Identity.SessionEndReason;
using RecordType = QTKD.Domain.Notifications.RecordType;
using SendStatus = QTKD.Domain.Notifications.SendStatus;
using QTKD.Infrastructure.Persistence.Schema;

namespace QTKD.Infrastructure.Persistence.Configurations.Identity;

/// <summary>qtkd.permission. Names follow the original Prisma DDL; CHECKs, triggers and expression indexes live in migration SQL.</summary>
public sealed class PermissionConfiguration : IEntityTypeConfiguration<Permission>
{
    public void Configure(EntityTypeBuilder<Permission> b)
    {
        b.ToTable("permission");
        b.HasKey(x => x.Code).HasName("permission_pkey");
        b.Property(x => x.Code).HasColumnName("code").HasColumnType("character varying(100)");
        b.Property(x => x.Name).HasColumnName("name").HasColumnType("character varying(200)");
    }
}
