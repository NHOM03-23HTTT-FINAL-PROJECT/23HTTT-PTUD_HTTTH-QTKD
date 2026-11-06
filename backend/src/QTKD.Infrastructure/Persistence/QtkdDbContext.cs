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
    public DbSet<QTKD.Infrastructure.Persistence.Schema.UserAccount> UserAccounts => Set<QTKD.Infrastructure.Persistence.Schema.UserAccount>();

    protected override void ConfigureConventions(ModelConfigurationBuilder configurationBuilder)
    {
        // The database only has the indexes the original DDL declared; EF must not add one per foreign key.
        configurationBuilder.Conventions.Remove<ForeignKeyIndexConvention>();
    }

    protected override void OnModelCreating(ModelBuilder b)
    {
        b.HasDefaultSchema(Schema);
        b.ApplyConfigurationsFromAssembly(typeof(QtkdDbContext).Assembly,
            t => t.Namespace?.StartsWith("QTKD.Infrastructure.Persistence.Configurations", StringComparison.Ordinal) == true);

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
