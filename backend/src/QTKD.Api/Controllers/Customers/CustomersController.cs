using System.Security.Claims;
using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using QTKD.Api.Filters;
using QTKD.Application.Common.Interfaces;
using QTKD.Application.Features.Customers;
using QTKD.Application.Features.Identity;
using QTKD.Infrastructure.Customers;

namespace QTKD.Api.Controllers.Customers;

[ApiController]
[Route("api/v1/customers")]
[Authorize(Policy = "customers.view")]
public sealed class CustomersController(CustomerService service, ICurrentActor currentActor, IIdentityService identity) : ControllerBase
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);
    private static readonly string[] CreateFields = ["name", "taxCode", "address", "representative", "contactName", "contactTitle", "phone", "email", "customerGroup", "serviceGroups"];
    private static readonly string[] UpdateFields = CreateFields.Where(x => x != "taxCode").ToArray();
    private string Key => Request.Headers["Idempotency-Key"].ToString();
    private Guid Session => Guid.TryParse(User.FindFirstValue("sid"), out var id) ? id : throw new CustomerFailure(401, "SESSION_ENDED");
    private async Task<Guid> Actor(CancellationToken ct) => (await currentActor.Get(ct)).Id;

    // Reject attempts to write server-owned fields rather than silently dropping them.
    private static T Parse<T>(JsonElement body, string[] outer, string[] draftFields)
    {
        if (body.ValueKind != JsonValueKind.Object || body.EnumerateObject().Any(p => !outer.Contains(p.Name)))
            throw new CustomerFailure(400, "IMMUTABLE_FIELD");
        if (body.TryGetProperty("draft", out var draft) && (draft.ValueKind != JsonValueKind.Object || draft.EnumerateObject().Any(p => !draftFields.Contains(p.Name))))
            throw new CustomerFailure(400, "IMMUTABLE_FIELD");
        try { return JsonSerializer.Deserialize<T>(body, Json) ?? throw new CustomerFailure(400, "VALIDATION"); }
        catch (JsonException) { throw new CustomerFailure(400, "VALIDATION"); }
    }

    [HttpGet]
    public async Task<CustomerSearchResult> Search(CancellationToken ct, string? keyword, string? status, string? sort, int? page, int? size) =>
        await service.Search(await Actor(ct), keyword, status ?? "active", sort ?? "updated-desc", page ?? 1, size ?? 8, ct);

    [HttpGet("form-options")]
    public object FormOptions() => new
    {
        // Provisional Sprint 1 options, pending the shared catalog integration.
        customerGroups = new[] { new { code = "XNK", label = "Doanh nghiệp xuất nhập khẩu" }, new { code = "HANG_TAU", label = "Hãng tàu / đại lý hãng tàu" }, new { code = "SAN_XUAT", label = "Doanh nghiệp sản xuất" }, new { code = "FORWARDER", label = "Công ty logistics / forwarder" }, new { code = "THUONG_MAI", label = "Doanh nghiệp thương mại" } },
        serviceGroups = new[] { new { code = "LUU_KHO", label = "Lưu kho" }, new { code = "BOC_XEP", label = "Bốc xếp" }, new { code = "VAN_CHUYEN_ND", label = "Vận chuyển nội địa" }, new { code = "KHAI_THAC_CANG", label = "Khai thác cảng" }, new { code = "VAN_HANH_TB", label = "Vận hành thiết bị" } }
    };

    [HttpGet("{code}")]
    public async Task<CustomerView> Get(string code, CancellationToken ct) => await service.Get(await Actor(ct), code, ct);

    [HttpPost, RequireCsrf, Authorize(Policy = "customers.create")]
    public async Task<CreateCustomerResult> Create(JsonElement body, CancellationToken ct) =>
        await service.Create(await Actor(ct), Session, Key, Parse<CreateCustomerRequest>(body, ["draft"], CreateFields), ct);

    [HttpPatch("{code}"), RequireCsrf, Authorize(Policy = "customers.update")]
    public async Task<UpdateCustomerResult> Update(string code, JsonElement body, CancellationToken ct) =>
        await service.Update(await Actor(ct), Session, code, Key, Parse<UpdateCustomerRequest>(body, ["baseVersion", "draft", "reason"], UpdateFields), ct);

    [HttpGet("delegations/candidates"), Authorize(Policy = "customers.change-status")]
    public async Task<StatusDelegationCandidate[]> Candidates(CancellationToken ct) => await service.DelegationCandidates(await Actor(ct), ct);

    [HttpGet("delegations"), Authorize(Policy = "customers.change-status")]
    public async Task<StatusDelegationView[]> Delegations(CancellationToken ct) => await service.Delegations(await Actor(ct), ct);

    [HttpPost("delegations"), RequireCsrf, Authorize(Policy = "customers.change-status")]
    public async Task<StatusDelegationView> Grant(GrantStatusDelegationRequest request, CancellationToken ct) =>
        await service.GrantDelegation(await Actor(ct), Session, request, ct);

    [HttpPost("delegations/{id:guid}/revoke"), RequireCsrf, Authorize(Policy = "customers.change-status")]
    public async Task<StatusDelegationView> Revoke(Guid id, CancellationToken ct) => await service.RevokeDelegation(await Actor(ct), Session, id, ct);

    [HttpGet("{code}/status-permissions")]
    public async Task<CustomerStatusPermissions> Permissions(string code, CancellationToken ct) => await service.GetStatusPermissions(await Actor(ct), code, ct);

    [HttpGet("{code}/reactivation-context")]
    public async Task<ReactivationContext> ReactivationContext(string code, CancellationToken ct) => await service.GetReactivationContext(await Actor(ct), code, ct);

    [HttpPost("{code}/reactivate"), RequireCsrf]
    public async Task<StatusChangeResult> Reactivate(string code, ReactivateCustomerRequest request, CancellationToken ct) =>
        await service.Reactivate(await Actor(ct), Session, code, Key, request, ct);

    [HttpGet("{code}/records/{group}")]
    public async Task<object> Records(string code, string group, CancellationToken ct)
    {
        var actor = await Actor(ct);
        await service.Get(actor, code, ct);
        if (group == "priceLists") throw new CustomerFailure(503, "SOURCE_UNAVAILABLE");
        var permission = group switch { "contracts" => "contracts.view", "payments" => "payments.view", _ => throw new CustomerFailure(404, "NOT_FOUND") };
        if (!await identity.HasPermission(actor, permission, ct)) throw new CustomerFailure(403, "FORBIDDEN");
        throw new CustomerFailure(503, "SOURCE_UNAVAILABLE");
    }
}
