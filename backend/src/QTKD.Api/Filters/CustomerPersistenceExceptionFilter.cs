using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;
using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace QTKD.Api.Filters;

// Keep customer persistence errors stable without changing main's behavior for other modules.
public sealed class CustomerPersistenceExceptionFilter : IExceptionFilter
{
    public void OnException(ExceptionContext context)
    {
        var error = context.Exception is DbUpdateException update ? update.InnerException : context.Exception;
        if (error is not NpgsqlException && context.Exception is not DbUpdateConcurrencyException) return;
        var conflict = context.Exception is DbUpdateConcurrencyException ||
            error is PostgresException { SqlState: "23505" or "40001" or "40P01" or "23514" };
        context.Result = new ObjectResult(new { code = conflict ? "CONFLICT" : "DATABASE_UNAVAILABLE", traceId = context.HttpContext.TraceIdentifier })
            { StatusCode = conflict ? 409 : 503 };
        context.ExceptionHandled = true;
    }
}
