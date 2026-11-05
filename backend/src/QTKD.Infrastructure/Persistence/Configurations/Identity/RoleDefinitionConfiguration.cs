using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using UserRole = QTKD.Domain.Identity.UserRole;
using UserStatus = QTKD.Domain.Identity.UserStatus;
using SessionEndReason = QTKD.Domain.Identity.SessionEndReason;
using RecordType = QTKD.Domain.Notifications.RecordType;
using SendStatus = QTKD.Domain.Notifications.SendStatus;
using QTKD.Infrastructure.Persistence.Schema;

namespace QTKD.Infrastructure.Persistence.Configurations.Identity;

/// <summary>qtkd.role_definition. Names follow the original Prisma DDL; CHECKs, triggers and expression indexes live in migration SQL.</summary>
public sealed class RoleDefinitionConfiguration : IEntityTypeConfiguration<RoleDefinition>
{
    public void Configure(EntityTypeBuilder<RoleDefinition> b)
    {
        b.ToTable("role_definition");
        b.HasKey(x => x.Code).HasName("role_definition_pkey");
        b.Property(x => x.Code).HasColumnName("code").ValueGeneratedNever();
        b.Property(x => x.Name).HasColumnName("name").HasColumnType("character varying(100)");
        b.Property(x => x.DepartmentCode).HasColumnName("department_code").HasColumnType("character varying(16)");
    }
}
