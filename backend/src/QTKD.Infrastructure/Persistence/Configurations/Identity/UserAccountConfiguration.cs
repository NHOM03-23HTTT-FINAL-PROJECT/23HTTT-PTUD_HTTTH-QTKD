using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using UserRole = QTKD.Domain.Identity.UserRole;
using UserStatus = QTKD.Domain.Identity.UserStatus;
using SessionEndReason = QTKD.Domain.Identity.SessionEndReason;
using RecordType = QTKD.Domain.Notifications.RecordType;
using SendStatus = QTKD.Domain.Notifications.SendStatus;
using QTKD.Infrastructure.Persistence.Schema;

namespace QTKD.Infrastructure.Persistence.Configurations.Identity;

/// <summary>qtkd.user_account. Names follow the original Prisma DDL; CHECKs, triggers and expression indexes live in migration SQL.</summary>
public sealed class UserAccountConfiguration : IEntityTypeConfiguration<UserAccount>
{
    public void Configure(EntityTypeBuilder<UserAccount> b)
    {
        b.ToTable("user_account");
        b.HasKey(x => x.UserId).HasName("user_account_pkey");
        b.Property(x => x.UserId).HasColumnName("user_id").HasColumnType("uuid").HasDefaultValueSql("gen_random_uuid()");
        b.Property(x => x.Username).HasColumnName("username").HasColumnType("character varying(100)");
        b.Property(x => x.CompanyEmail).HasColumnName("company_email").HasColumnType("character varying(254)");
        b.Property(x => x.PasswordHash).HasColumnName("password_hash").HasColumnType("text");
        b.Property(x => x.FullName).HasColumnName("full_name").HasColumnType("character varying(200)");
        b.Property(x => x.DepartmentId).HasColumnName("department_id").HasColumnType("uuid");
        b.Property(x => x.Role).HasColumnName("role");
        b.Property(x => x.Status).HasColumnName("status").HasDefaultValue(UserStatus.Active);
        b.Property(x => x.FailedLoginCount).HasColumnName("failed_login_count").HasDefaultValue(0);
        b.Property(x => x.LockedUntil).HasColumnName("locked_until").HasColumnType("timestamp(6) with time zone");
        b.Property(x => x.MustChangePassword).HasColumnName("must_change_password").HasDefaultValue(true);
        b.Property(x => x.CanSign).HasColumnName("can_sign").HasDefaultValue(false);
        b.Property(x => x.PasswordChangedAt).HasColumnName("password_changed_at").HasColumnType("timestamp(6) with time zone");
        b.HasIndex(x => x.Username).IsUnique().HasDatabaseName("user_account_username_key");
        b.HasIndex(x => x.CompanyEmail).IsUnique().HasDatabaseName("user_account_company_email_key");
        b.HasIndex(x => x.DepartmentId).HasDatabaseName("user_account_department_id_idx");
        b.HasOne<RoleDefinition>().WithMany().HasForeignKey(x => x.Role)
            .HasConstraintName("user_account_role_fkey").OnDelete(DeleteBehavior.Restrict);
        b.HasOne<Department>().WithMany().HasForeignKey(x => x.DepartmentId)
            .HasConstraintName("user_account_department_id_fkey").OnDelete(DeleteBehavior.Restrict);
    }
}
