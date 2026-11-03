using Microsoft.EntityFrameworkCore;
using QTKD.Domain.Entities;
using QTKD.Domain.Enums;
using QTKD.Domain.Identity;

namespace QTKD.Infrastructure.Persistence;

public class QtkdDbContext : DbContext
{
    public QtkdDbContext(DbContextOptions<QtkdDbContext> options) : base(options)
    {
    }

    public DbSet<Area> Areas => Set<Area>();
    public DbSet<Service> Services => Set<Service>();
    public DbSet<AreaService> AreaServices => Set<AreaService>();
    public DbSet<AreaAssignment> AreaAssignments => Set<AreaAssignment>();
    public DbSet<UserAccount> UserAccounts => Set<UserAccount>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);
        modelBuilder.HasDefaultSchema("qtkd");

        // Area configuration
        modelBuilder.Entity<Area>(entity =>
        {
            entity.ToTable("area");
            entity.HasKey(e => e.AreaId);

            entity.Property(e => e.AreaId).HasColumnName("area_id");
            entity.Property(e => e.AreaCode).HasColumnName("area_code").HasMaxLength(50).IsRequired();
            entity.Property(e => e.AreaName).HasColumnName("area_name").HasMaxLength(200).IsRequired();
            entity.Property(e => e.AreaType).HasColumnName("area_type").HasMaxLength(100).IsRequired();
            entity.Property(e => e.ParentAreaId).HasColumnName("parent_area_id");
            entity.Property(e => e.Level).HasColumnName("level").IsRequired();
            entity.Property(e => e.HierarchyPath).HasColumnName("hierarchy_path").IsRequired();
            entity.Property(e => e.Coordinates).HasColumnName("coordinates");
            entity.Property(e => e.AreaM2).HasColumnName("area_m2").HasPrecision(19, 4).IsRequired();
            entity.Property(e => e.Capacity).HasColumnName("capacity").HasPrecision(19, 4).IsRequired();
            entity.Property(e => e.TechnicalDescription).HasColumnName("technical_description");
            entity.Property(e => e.Status).HasColumnName("status").IsRequired();
            entity.Property(e => e.RowVersion).HasColumnName("row_version").IsRequired();

            entity.HasOne(e => e.ParentArea)
                .WithMany(p => p.SubAreas)
                .HasForeignKey(e => e.ParentAreaId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        // Service configuration
        modelBuilder.Entity<Service>(entity =>
        {
            entity.ToTable("service");
            entity.HasKey(e => e.ServiceId);

            entity.Property(e => e.ServiceId).HasColumnName("service_id");
            entity.Property(e => e.ServiceName).HasColumnName("service_name").HasMaxLength(200).IsRequired();
            entity.Property(e => e.Unit).HasColumnName("unit").HasMaxLength(50).IsRequired();
            entity.Property(e => e.IsMandatory).HasColumnName("is_mandatory").IsRequired();
        });

        // AreaService configuration (composite key)
        modelBuilder.Entity<AreaService>(entity =>
        {
            entity.ToTable("area_service");
            entity.HasKey(e => new { e.AreaId, e.ServiceId });

            entity.Property(e => e.AreaId).HasColumnName("area_id");
            entity.Property(e => e.ServiceId).HasColumnName("service_id");

            entity.HasOne(e => e.Area)
                .WithMany(a => a.AreaServices)
                .HasForeignKey(e => e.AreaId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(e => e.Service)
                .WithMany(s => s.AreaServices)
                .HasForeignKey(e => e.ServiceId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        // AreaAssignment configuration
        modelBuilder.Entity<AreaAssignment>(entity =>
        {
            entity.ToTable("area_assignment");
            entity.HasKey(e => e.AssignmentId);

            entity.Property(e => e.AssignmentId).HasColumnName("assignment_id");
            entity.Property(e => e.AreaId).HasColumnName("area_id");
            entity.Property(e => e.UserId).HasColumnName("user_id");
            entity.Property(e => e.FromDate).HasColumnName("from_date").IsRequired();
            entity.Property(e => e.ToDate).HasColumnName("to_date");

            entity.HasOne(e => e.Area)
                .WithMany(a => a.AreaAssignments)
                .HasForeignKey(e => e.AreaId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(e => e.User)
                .WithMany()
                .HasForeignKey(e => e.UserId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        // UserAccount configuration
        modelBuilder.Entity<UserAccount>(entity =>
        {
            entity.ToTable("user_account");
            entity.HasKey(e => e.UserId);

            entity.Property(e => e.UserId).HasColumnName("user_id");
            entity.Property(e => e.Username).HasColumnName("username").HasMaxLength(100).IsRequired();
            entity.Property(e => e.CompanyEmail).HasColumnName("company_email").HasMaxLength(254).IsRequired();
            entity.Property(e => e.PasswordHash).HasColumnName("password_hash").IsRequired();
            entity.Property(e => e.FullName).HasColumnName("full_name").HasMaxLength(200).IsRequired();
            entity.Property(e => e.DepartmentId).HasColumnName("department_id").IsRequired();
            entity.Property(e => e.Role).HasColumnName("role").IsRequired();
            entity.Property(e => e.Status).HasColumnName("status").IsRequired();
            entity.Property(e => e.FailedLoginCount).HasColumnName("failed_login_count");
            entity.Property(e => e.LockedUntil).HasColumnName("locked_until");
            entity.Property(e => e.MustChangePassword).HasColumnName("must_change_password");
            entity.Property(e => e.CanSign).HasColumnName("can_sign");
            entity.Property(e => e.PasswordChangedAt).HasColumnName("password_changed_at");
        });
    }
}
