using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Conventions;
using Microsoft.EntityFrameworkCore.Storage.ValueConversion;
using QTKD.Domain.Entities;
using QTKD.Domain.Identity;
using QTKD.Domain.Notifications;
using QTKD.Infrastructure.Persistence.Schema;

namespace QTKD.Infrastructure.Persistence;

/// <summary>
/// Owner of the qtkd schema and its EF Core migrations (Persistence/Migrations). The model mirrors the tables,
/// columns, keys, foreign keys, plain indexes, sequences and enums. CHECK constraints, triggers, functions, RLS and
/// expression/partial indexes exist only in the migration SQL.
/// </summary>
public sealed class QtkdDbContext : DbContext
{
    public const string Schema = "qtkd";
    public const string HistoryTable = "__EFMigrationsHistory";

    public QtkdDbContext(DbContextOptions<QtkdDbContext> options) : base(options)
    {
    }

    public DbSet<Notification> Notifications => Set<Notification>();
    public DbSet<Contract> Contracts => Set<Contract>();
    public DbSet<QTKD.Domain.Entities.Area> Areas => Set<QTKD.Domain.Entities.Area>();
    public DbSet<QTKD.Domain.Entities.Service> Services => Set<QTKD.Domain.Entities.Service>();
    public DbSet<QTKD.Domain.Entities.AreaService> AreaServices => Set<QTKD.Domain.Entities.AreaService>();
    public DbSet<QTKD.Domain.Entities.AreaAssignment> AreaAssignments => Set<QTKD.Domain.Entities.AreaAssignment>();
    public DbSet<QTKD.Domain.Identity.UserAccount> UserAccounts => Set<QTKD.Domain.Identity.UserAccount>();

    protected override void ConfigureConventions(ModelConfigurationBuilder configurationBuilder)
    {
        // The database only has the indexes the original DDL declared; EF must not add one per foreign key.
        configurationBuilder.Conventions.Remove<ForeignKeyIndexConvention>();
    }

    protected override void OnModelCreating(ModelBuilder b)
    {
        b.HasDefaultSchema(Schema);
        b.ApplyConfigurationsFromAssembly(typeof(QtkdDbContext).Assembly,
            t => t.Namespace?.StartsWith("QTKD.Infrastructure.Persistence.Configurations", StringComparison.Ordinal) == true
                 && !t.Namespace.Contains("Configurations.Areas")
                 && !t.Namespace.Contains("Configurations.Catalogs"));

        // Area configuration
        b.Entity<QTKD.Domain.Entities.Area>(entity =>
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
        b.Entity<QTKD.Domain.Entities.Service>(entity =>
        {
            entity.ToTable("service");
            entity.HasKey(e => e.ServiceId);

            entity.Property(e => e.ServiceId).HasColumnName("service_id");
            entity.Property(e => e.ServiceName).HasColumnName("service_name").HasMaxLength(200).IsRequired();
            entity.Property(e => e.Unit).HasColumnName("unit").HasMaxLength(50).IsRequired();
            entity.Property(e => e.IsMandatory).HasColumnName("is_mandatory").IsRequired();
        });

        // AreaService configuration (composite key)
        b.Entity<QTKD.Domain.Entities.AreaService>(entity =>
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
        b.Entity<QTKD.Domain.Entities.AreaAssignment>(entity =>
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
        b.Entity<QTKD.Domain.Identity.UserAccount>(entity =>
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

        if (Database.ProviderName?.Contains("Sqlite") == true)
        {
            UseSqliteTestShape(b);
            return;
        }

        b.HasSequence<long>("customer_code_seq");
        b.HasSequence<long>("service_code_seq");
        b.HasSequence<long>("contract_code_seq");
    }

    // Offline tests only: SQLite has no PostgreSQL enums, column types, default functions or sequences.
    private static void UseSqliteTestShape(ModelBuilder b)
    {
        foreach (var entity in b.Model.GetEntityTypes())
        {
            foreach (var property in entity.GetProperties())
            {
                property.SetColumnType(null);
                property.SetDefaultValueSql(null);
                var type = Nullable.GetUnderlyingType(property.ClrType) ?? property.ClrType;
                if (type.IsEnum)
                    property.SetValueConverter((ValueConverter)Activator.CreateInstance(
                        typeof(EnumToStringConverter<>).MakeGenericType(type), [null])!);
            }
        }
    }
}
