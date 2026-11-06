using System.Net;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;

namespace QTKD.Api.Middlewares;

public class ExceptionHandlingMiddleware
{
    private readonly RequestDelegate _next;
    private readonly ILogger<ExceptionHandlingMiddleware> _logger;

    public ExceptionHandlingMiddleware(RequestDelegate next, ILogger<ExceptionHandlingMiddleware> logger)
    {
        _next = next;
        _logger = logger;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        try
        {
            await _next(context);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Lỗi xảy ra trong quá trình xử lý yêu cầu: {Message}", ex.Message);
            await HandleExceptionAsync(context, ex);
        }
    }

    private static Task HandleExceptionAsync(HttpContext context, Exception exception)
    {
        var code = HttpStatusCode.InternalServerError;
        var message = "Đã xảy ra lỗi hệ thống. Vui lòng thử lại sau.";

        switch (exception)
        {
            case ArgumentException or InvalidOperationException:
                code = HttpStatusCode.BadRequest;
                message = exception.Message;
                break;
            case KeyNotFoundException:
                code = HttpStatusCode.NotFound;
                message = exception.Message;
                break;
            case DbUpdateConcurrencyException:
                code = HttpStatusCode.Conflict;
                message = "Dữ liệu đã bị thay đổi bởi người khác (xung đột phiên bản). Vui lòng làm mới dữ liệu và thử lại.";
                break;
        }

        context.Response.ContentType = "application/json";
        context.Response.StatusCode = (int)code;

        var result = JsonSerializer.Serialize(new
        {
            statusCode = (int)code,
            error = message,
            detail = exception.ToString(),
            timestamp = DateTime.UtcNow
        });

        return context.Response.WriteAsync(result);
    }
}