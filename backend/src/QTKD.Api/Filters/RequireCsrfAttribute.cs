using Microsoft.AspNetCore.Mvc.Filters;
using QTKD.Domain.Contracts;

namespace QTKD.Api.Filters;

/// <summary>
/// Cookie-session write guard for controller actions: requires X-QTKD-CSRF: 1 and an Origin listed in
/// Cors:Origins. Same rule as the minimal-API writes; rejection is 403 CSRF_REJECTED.
/// </summary>
[AttributeUsage(AttributeTargets.Method | AttributeTargets.Class)]
public sealed class RequireCsrfAttribute : Attribute, IActionFilter
{
    public void OnActionExecuting(ActionExecutingContext context)
    {
        var request = context.HttpContext.Request;
        var origins = context.HttpContext.RequestServices.GetRequiredService<IConfiguration>()
            .GetSection("Cors:Origins").Get<string[]>() ?? [];
        if (request.Headers["X-QTKD-CSRF"] != "1" || !origins.Contains(request.Headers.Origin.ToString(), StringComparer.Ordinal))
        {
            throw new BusinessException("CSRF_REJECTED", 403);
        }
    }

    public void OnActionExecuted(ActionExecutedContext context)
    {
    }
}
