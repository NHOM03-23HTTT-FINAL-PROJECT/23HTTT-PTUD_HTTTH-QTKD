using Microsoft.OpenApi;
using QTKD.Application.Features.Identity;

namespace QTKD.Api.Authentication;

internal static class AuthOpenApi
{
    public static void AddAuthOpenApi(this IServiceCollection services) => services.AddOpenApi(options =>
    {
        options.ShouldInclude = api => api.RelativePath?.StartsWith("api/v1/auth/", StringComparison.Ordinal) == true;
        options.AddDocumentTransformer((document, _, _) =>
        {
            document.Info.Title = "QTKD Authentication API";
            document.Components ??= new OpenApiComponents();
            document.Components.SecuritySchemes = new Dictionary<string, IOpenApiSecurityScheme>
            {
                ["Bearer"] = new OpenApiSecurityScheme { Type = SecuritySchemeType.Http, Scheme = "bearer", BearerFormat = "JWT" }
            };

            foreach (var path in new[] { "/api/v1/auth/session", "/api/v1/auth/activity", "/api/v1/auth/password/change" })
                foreach (var operation in document.Paths[path].Operations!.Values)
                    operation.Security = [new OpenApiSecurityRequirement { [new OpenApiSecuritySchemeReference("Bearer", document)] = [] }];

            return Task.CompletedTask;
        });
        options.AddOperationTransformer((operation, context, _) =>
        {
            if (context.Description.HttpMethod == "POST" && context.Description.RelativePath != "api/v1/auth/activity")
            {
                operation.Parameters ??= [];
                operation.Parameters.Add(new OpenApiParameter
                {
                    Name = "X-QTKD-CSRF", In = ParameterLocation.Header, Required = true,
                    Description = "Enter 1. The request Origin must be allowed by the API.",
                    Schema = new OpenApiSchema { Type = JsonSchemaType.String, Default = System.Text.Json.Nodes.JsonValue.Create("1") }
                });
            }
            return Task.CompletedTask;
        });
    });

    public static RouteHandlerBuilder AuthErrors(this RouteHandlerBuilder route, params int[] statuses)
    {
        foreach (var status in statuses) route.Produces<AuthErrorResponse>(status);
        return route.Produces<AuthErrorResponse>(500);
    }
}

internal sealed record AuthErrorResponse(string Code, string? TraceId, int? RemainingAttempts, DateTime? LockedUntil);

internal sealed record AuthResponse(string AccessToken, DateTime AccessTokenExpiresAt, AuthUser User,
    DateTime SignedInAt, DateTime IdleExpiresAt, DateTime ExpiresAt, LoginTrace? PreviousLogin, DateTime? PasswordChangedAt)
{
    public static AuthResponse From(AuthResult result) => new(result.AccessToken, result.AccessTokenExpiresAt, result.User,
        result.SignedInAt, result.IdleExpiresAt, result.ExpiresAt, result.PreviousLogin, result.User.PasswordChangedAt);
}
