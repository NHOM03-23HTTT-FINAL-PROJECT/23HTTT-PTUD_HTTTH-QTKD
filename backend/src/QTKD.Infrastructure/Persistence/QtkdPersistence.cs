using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;
using Microsoft.Extensions.DependencyInjection;
using Npgsql;
using Npgsql.EntityFrameworkCore.PostgreSQL.Infrastructure;
using Npgsql.NameTranslation;
using QTKD.Domain.Identity;
using QTKD.Domain.Notifications;
using QTKD.Application.Common.Interfaces;
using QTKD.Infrastructure.Repositories;
using QTKD.Infrastructure.Persistence.Schema;

namespace QTKD.Infrastructure.Persistence;

public static class QtkdPersistence
{
    /// <summary>
    /// Registers QtkdDbContext and the repositories built on it. Pass the app's single enum name translator: a new
    /// instance per scope makes EF build a new internal service provider on every request.
    /// The API never migrates on start-up; migrations run through QTKD.DbTool.
    /// </summary>
    public static IServiceCollection AddQtkdPersistence(this IServiceCollection services,
        Func<IServiceProvider, string> connectionString, INpgsqlNameTranslator enumNames)
    {
        services.AddDbContext<QtkdDbContext>((sp, options) =>
            options.UseNpgsql(connectionString(sp), pg => Configure(pg, enumNames)));
        services.AddScoped<INotificationRepository, NotificationRepository>();
        services.AddScoped<ICustomerRepository, CustomerRepository>();
        services.AddScoped<ContractRepository>();
        services.AddScoped<IContractRepository>(sp => sp.GetRequiredService<ContractRepository>());
        services.AddScoped<IContractManagementRepository>(sp => sp.GetRequiredService<ContractRepository>());
        services.AddScoped<IApprovalAssignmentRepository, ApprovalAssignmentRepository>();
        services.AddScoped<IAuditLogRepository, AuditLogRepository>();
        return services;
    }

    /// <summary>Npgsql options shared by the API, the design-time factory and QTKD.DbTool.</summary>
    public static void Configure(NpgsqlDbContextOptionsBuilder pg, INpgsqlNameTranslator enumNames)
    {
        const string s = QtkdDbContext.Schema;
        pg.MigrationsHistoryTable(QtkdDbContext.HistoryTable, s);
        pg.MapEnum<UserRole>("user_role", s, enumNames);
        pg.MapEnum<UserStatus>("user_status", s, enumNames);
        pg.MapEnum<SessionEndReason>("session_end_reason", s, enumNames);
        pg.MapEnum<RecordType>("record_type", s, enumNames);
        pg.MapEnum<DocumentRecordType>("document_record_type", s, enumNames);
        pg.MapEnum<SendStatus>("send_status", s, enumNames);
        pg.MapEnum<QTKD.Domain.Enums.ActiveStatus>("active_status", s, enumNames);
        pg.MapEnum<CustomerDecisionType>("customer_decision_type", s, enumNames);
        pg.MapEnum<ContractDocumentType>("contract_document_type", s, enumNames);
        pg.MapEnum<ContractStatus>("contract_status", s, enumNames);
        pg.MapEnum<PriceListStatus>("price_list_status", s, enumNames);
        pg.MapEnum<VolumeStatus>("volume_status", s, enumNames);
        pg.MapEnum<PaymentStatus>("payment_status", s, enumNames);
        pg.MapEnum<CustomerResult>("customer_result", s, enumNames);
        pg.MapEnum<ChangeRequestType>("change_request_type", s, enumNames);
        pg.MapEnum<ChangeRequestStatus>("change_request_status", s, enumNames);
        pg.MapEnum<ApprovalResult>("approval_result", s, enumNames);
        pg.MapEnum<ApprovalStepStatus>("approval_step_status", s, enumNames);
        pg.MapEnum<ApprovalDecision>("approval_decision", s, enumNames);
        pg.MapEnum<SigningStatus>("signing_status", s, enumNames);
    }

    /// <summary>Options for tools outside the API host (design time, QTKD.DbTool).</summary>
    public static DbContextOptions<QtkdDbContext> Options(string connectionString) =>
        new DbContextOptionsBuilder<QtkdDbContext>()
            .UseNpgsql(connectionString, pg => Configure(pg, new NpgsqlNullNameTranslator()))
            .Options;
}

/// <summary>
/// Used only by the dotnet-ef CLI. "migrations add/script" never connect, so a placeholder is enough.
/// Apply migrations with QTKD.DbTool, not "dotnet ef database update".
/// </summary>
public sealed class QtkdDbContextFactory : IDesignTimeDbContextFactory<QtkdDbContext>
{
    public QtkdDbContext CreateDbContext(string[] args) =>
        new(QtkdPersistence.Options("Host=design-time.invalid;Database=postgres"));
}
