using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Npgsql;
using Npgsql.NameTranslation;
using QTKD.Application.Features.Areas.Services;
using QTKD.Domain.Enums;
using QTKD.Domain.Identity;
using QTKD.Infrastructure.Areas;
using QTKD.Infrastructure.Persistence;

namespace QTKD.Infrastructure;

public static class DependencyInjection
{
    private static readonly NpgsqlNullNameTranslator NullTranslator = new();

    public static IServiceCollection AddAreaInfrastructure(this IServiceCollection services, IConfiguration configuration)
    {
        services.AddDbContext<QtkdDbContext>((sp, options) =>
        {
            var config = sp.GetRequiredService<IConfiguration>();
            var connectionString = config.GetConnectionString("Identity")
                ?? config.GetConnectionString("DefaultConnection")
                ?? throw new InvalidOperationException("ConnectionStrings:Identity is required for QtkdDbContext.");

            options.UseNpgsql(connectionString, pg =>
            {
                pg.MapEnum<ActiveStatus>("active_status", "qtkd", NullTranslator);
                pg.MapEnum<UserRole>("user_role", "qtkd", NullTranslator);
                pg.MapEnum<UserStatus>("user_status", "qtkd", NullTranslator);
                pg.MapEnum<SessionEndReason>("session_end_reason", "qtkd", NullTranslator);
                pg.MigrationsHistoryTable("__EFMigrationsHistory", "qtkd");
            });
            options.ConfigureWarnings(w => w.Ignore(Microsoft.EntityFrameworkCore.Diagnostics.CoreEventId.ManyServiceProvidersCreatedWarning));
        });

        services.AddScoped<IAreaService, AreaService>();

        return services;
    }
}
