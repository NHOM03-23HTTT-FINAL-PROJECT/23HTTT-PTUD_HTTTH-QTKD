using System.Security.Claims;
using System.Text.Json;
using QTKD.Application.Features.Customers;
using QTKD.Application.Features.Identity;
using QTKD.Infrastructure.Customers;

namespace QTKD.Api.Customers;

public static class CustomerEndpoints
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);
    private static Guid Actor(HttpContext context) => Guid.Parse(context.User.FindFirstValue("sub")!);
    private static Guid Session(HttpContext context) => Guid.Parse(context.User.FindFirstValue("sid")!);
    private static string Key(HttpContext context) => context.Request.Headers["Idempotency-Key"].ToString();
    private static T Parse<T>(JsonElement body, string[] outer, string[] draftFields)
    {
        if (body.ValueKind != JsonValueKind.Object || body.EnumerateObject().Any(p => !outer.Contains(p.Name)))
            throw new CustomerFailure(400, "IMMUTABLE_FIELD");
        if (body.TryGetProperty("draft", out var draft) && (draft.ValueKind != JsonValueKind.Object || draft.EnumerateObject().Any(p => !draftFields.Contains(p.Name))))
            throw new CustomerFailure(400, "IMMUTABLE_FIELD");
        try { return JsonSerializer.Deserialize<T>(body, Json) ?? throw new CustomerFailure(400, "VALIDATION"); }
        catch (JsonException) { throw new CustomerFailure(400, "VALIDATION"); }
    }
    private static readonly string[] CreateFields = ["name", "taxCode", "address", "representative", "contactName", "contactTitle", "phone", "email", "customerGroup", "serviceGroups"];
    private static readonly string[] UpdateFields = CreateFields.Where(x => x != "taxCode").ToArray();

    public static void MapCustomerEndpoints(this WebApplication app)
    {
        var api = app.MapGroup("/api/v1/customers");
        api.MapGet("/", async (HttpContext context, CustomerService service, CancellationToken ct, string? keyword, string? status, string? sort, int? page, int? size) =>
            Results.Ok(await service.Search(Actor(context), keyword, status ?? "all", sort ?? "updated-desc", page ?? 1, size ?? 8, ct)))
            .RequireAuthorization("customers.view");
        api.MapGet("/form-options", () => Results.Ok(new
        {
            // These provisional Sprint 1 options must be replaced by the shared catalog when it exists.
            customerGroups = new[] { new { code = "XNK", label = "Doanh nghiệp xuất nhập khẩu" }, new { code = "HANG_TAU", label = "Hãng tàu / đại lý hãng tàu" }, new { code = "SAN_XUAT", label = "Doanh nghiệp sản xuất" }, new { code = "FORWARDER", label = "Công ty logistics / forwarder" }, new { code = "THUONG_MAI", label = "Doanh nghiệp thương mại" } },
            serviceGroups = new[] { new { code = "LUU_KHO", label = "Lưu kho" }, new { code = "BOC_XEP", label = "Bốc xếp" }, new { code = "VAN_CHUYEN_ND", label = "Vận chuyển nội địa" }, new { code = "KHAI_THAC_CANG", label = "Khai thác cảng" }, new { code = "VAN_HANH_TB", label = "Vận hành thiết bị" } }
        })).RequireAuthorization("customers.view");
        api.MapGet("/{code}", async (string code, HttpContext context, CustomerService service, CancellationToken ct) =>
            Results.Ok(await service.Get(Actor(context), code, ct))).RequireAuthorization("customers.view");
        api.MapPost("/", async (JsonElement body, HttpContext context, CustomerService service, CancellationToken ct) =>
            Results.Ok(await service.Create(Actor(context), Session(context), Key(context), Parse<CreateCustomerRequest>(body, ["draft"], CreateFields), ct)))
            .RequireAuthorization("customers.create", "customers.view");
        api.MapPatch("/{code}", async (string code, JsonElement body, HttpContext context, CustomerService service, CancellationToken ct) =>
            Results.Ok(await service.Update(Actor(context), Session(context), code, Key(context), Parse<UpdateCustomerRequest>(body, ["baseVersion", "draft", "reason"], UpdateFields), ct)))
            .RequireAuthorization("customers.update", "customers.view");

        api.MapGet("/{code}/suspension-review", async (string code, HttpContext context, CustomerService service, CancellationToken ct) =>
            Results.Ok(await service.GetSuspensionReview(Actor(context), code, ct))).RequireAuthorization("customers.change-status", "customers.view");
        api.MapGet("/{code}/reactivation-context", async (string code, HttpContext context, CustomerService service, CancellationToken ct) =>
            Results.Ok(await service.GetReactivationContext(Actor(context), code, ct))).RequireAuthorization("customers.change-status", "customers.view");
        api.MapPost("/{code}/suspend", async (string code, SuspendCustomerRequest request, HttpContext context, CustomerService service, CancellationToken ct) =>
            Results.Ok(await service.Suspend(Actor(context), Session(context), code, Key(context), request, ct))).RequireAuthorization("customers.change-status", "customers.view");
        api.MapPost("/{code}/reactivate", async (string code, ReactivateCustomerRequest request, HttpContext context, CustomerService service, CancellationToken ct) =>
            Results.Ok(await service.Reactivate(Actor(context), Session(context), code, Key(context), request, ct))).RequireAuthorization("customers.change-status", "customers.view");
        api.MapGet("/{code}/records/{group}", async (string code, string group, HttpContext context, CustomerService service, IIdentityService identity, CancellationToken ct) =>
        {
            await service.Get(Actor(context), code, ct);
            var permission = group switch { "contracts" => "contracts.view", "payments" => "payments.view", "priceLists" => null, _ => throw new CustomerFailure(404, "NOT_FOUND") };
            if (permission is null || !await identity.HasPermission(Actor(context), permission, ct)) throw new CustomerFailure(403, "FORBIDDEN");
            throw new CustomerFailure(503, "SOURCE_UNAVAILABLE");
        }).RequireAuthorization("customers.view");
    }
}
