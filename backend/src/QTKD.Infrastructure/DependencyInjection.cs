using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using QTKD.Application.Features.Areas.Services;
using QTKD.Infrastructure.Areas;

namespace QTKD.Infrastructure;

public static class DependencyInjection
{
    public static IServiceCollection AddAreaInfrastructure(this IServiceCollection services, IConfiguration configuration)
    {
        services.AddScoped<IAreaService, AreaService>();
        return services;
    }
}
