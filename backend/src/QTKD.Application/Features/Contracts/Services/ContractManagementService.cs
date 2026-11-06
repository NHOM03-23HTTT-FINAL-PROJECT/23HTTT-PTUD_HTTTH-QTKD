using System.Text.Json;
using System.Text.Json.Nodes;
using QTKD.Application.Common.Interfaces;
using QTKD.Domain.Contracts;

namespace QTKD.Application.Features.Contracts;

public partial class ContractService
{
    private static readonly JsonSerializerOptions Web = new(JsonSerializerDefaults.Web);
    private static JsonObject Object(object value) => JsonSerializer.SerializeToNode(value, Web)!.AsObject();
    private static JsonArray DataArray<T>(IEnumerable<T> values) => JsonSerializer.SerializeToNode(values, Web)!.AsArray();

    private static void ViewRole(Actor actor)
    {
        if (!actor.CanViewContracts)
            throw new BusinessException("FORBIDDEN", 403);
    }

    public async Task<JsonObject> Options(Actor actor, CancellationToken ct)
    {
        ViewRole(actor);
        var catalog = await _management.CatalogAsync(ct);
        var byId = catalog.Areas.ToDictionary(a => a.Id);
        bool Active(ContractArea area)
        {
            var seen = new HashSet<Guid>();
            while (true)
            {
                if (!seen.Add(area.Id) || !area.Active)
                    return false;
                if (area.ParentId is not Guid parent)
                    return true;
                if (!byId.TryGetValue(parent, out area!))
                    return false;
            }
        }
        return new JsonObject
        {
            ["customers"] = DataArray(catalog.Customers.Select(c => CustomerSnapshot(c, false))),
            ["areas"] = DataArray(catalog.Areas.Where(Active).Select(a => new { a.Code, a.Name, a.Level })),
            ["services"] = DataArray(catalog.Services),
            ["templates"] = new JsonArray(Object(new
            {
                code = "MHD-THAM-KHAO-01",
                name = "Mẫu tham khảo dịch vụ logistics",
                version = "1",
                title = "Hợp đồng dịch vụ logistics",
                contractType = "Dịch vụ logistics",
                paymentTerm = "Thanh toán theo thỏa thuận của hai bên.",
                content = "Điều 1. Phạm vi dịch vụ\nCác bên thống nhất các hạng mục dịch vụ ghi trong hồ sơ.\n\nĐiều 2. Thanh toán\nHoàn thiện theo thỏa thuận thực tế trước khi trình duyệt.",
                services = System.Array.Empty<object>()
            })),
            ["contractTypes"] = new JsonArray("Dịch vụ logistics", "Vận chuyển", "Kho bãi")
        };
    }

    public async Task<JsonObject> Filters(Actor actor, CancellationToken ct)
    {
        ViewRole(actor);
        var filters = await _management.FiltersAsync(actor, ct);
        return new JsonObject
        {
            ["areas"] = DataArray(filters.Areas.Select(a => new { a.Code, a.Name, a.Level })),
            ["contractTypes"] = DataArray(filters.ContractTypes),
            ["coordinationDepartments"] = new JsonArray()
        };
    }

    public async Task<JsonObject> List(Actor actor, ContractQuery query, CancellationToken ct)
    {
        ViewRole(actor);
        query.Keyword ??= string.Empty;
        query.Status ??= string.Empty;
        query.AreaCode ??= string.Empty;
        query.ContractType ??= string.Empty;
        string[] statuses = ["", "draft", "submitted", "under-review", "revision-requested", "rejected", "approved", "active", "cancelled"];
        if (query.Page < 1 || query.Page > 100000 || query.Size is < 1 or > 100 || query.Keyword.Length > 200 || !statuses.Contains(query.Status))
            throw new BusinessException("VALIDATION", 422);
        var page = await _management.ListAsync(actor, query, ct);
        return Object(new
        {
            page.Total,
            query.Page,
            query.Size,
            scope = actor.Role switch { "SalesStaff" => "own", "SalesManager" => "department", "LegalStaff" => "assigned", _ => "granted" },
            items = page.Items.Select(c => new
            {
                c.Code,
                c.Title,
                c.ContractType,
                c.CustomerCode,
                c.CustomerName,
                c.EffectiveFrom,
                c.EffectiveTo,
                status = ContractRules.ToClientStatus(c.Status),
                c.OwnerName,
                updatedAt = Time(c.UpdatedAt),
                c.AreaCodes
            })
        });
    }

    public async Task<JsonObject> Get(Actor actor, string code, CancellationToken ct)
    {
        ViewRole(actor);
        return Detail(await Find(actor, code, ct), actor);
    }

    private async Task<ContractRecord> Locked(Actor actor, string code, CancellationToken ct)
    {
        ViewRole(actor);
        return await _management.LockAsync(actor, code, ct) ?? throw new BusinessException("NOT_FOUND", 404);
    }

    private async Task Editable(Actor actor, ContractRecord current, int version, CancellationToken ct)
    {
        ContractRules.RequireOwner(actor, current.OwnerId);
        ContractRules.RequireEditable(current.Status);
        ContractRules.RequireVersion(current.Version, version);
        await NoPendingCancellation(current.Id, ct);
    }

    private async Task<JsonObject> Write(Actor actor, string operation, string key, object payload, Func<Task<JsonObject>> action, CancellationToken ct)
    {
        ViewRole(actor);
        var result = await _contracts.IdempotentAsync(actor, operation, Key(key), payload, action, ct);
        if (result["replayed"]?.GetValue<bool>() == true && result["contract"]?["code"] is JsonValue replayCode)
            await Find(actor, replayCode.GetValue<string>(), ct);
        return result;
    }

    private async Task<JsonObject> Changed(Actor actor, string code, string action, ContractRecord? before, string? note, CancellationToken ct)
    {
        var next = await Find(actor, code, ct);
        var data = Detail(next, actor);
        var snapshot = data.DeepClone().AsObject();
        snapshot["auditActor"] = Object(new { actor.Id, actor.Name, actor.Role, actor.DepartmentId });
        await _contracts.AuditAsync(next.Id, action, actor.Id, before?.Status, next.Status,
            before == null ? null : Detail(before, actor), snapshot, note, ct);
        return data;
    }

    private static JsonObject CustomerSnapshot(ContractCustomer customer, bool includeId)
    {
        var data = Object(new
        {
            customer.Code,
            customer.Name,
            customer.TaxCode,
            customer.Address,
            customer.Representative,
            customer.ContactName,
            customer.Phone,
            customer.Email
        });
        if (includeId)
            data["id"] = customer.Id.ToString();
        else
            data["status"] = customer.Active ? "active" : "suspended";
        return data;
    }

    private async Task<string> References(ContractDraft draft, CancellationToken ct)
    {
        if (draft.SourceMode == "template" && draft.TemplateCode != "MHD-THAM-KHAO-01")
            throw new BusinessException("VALIDATION", 422, new { fieldErrors = new { templateCode = "Mẫu hợp đồng không còn hợp lệ." } });
        var references = await _management.LockReferencesAsync(draft, ct);
        var customer = references.Customer;
        if (customer == null || !customer.Active)
            throw new BusinessException("CUSTOMER_INACTIVE", 409, new { fieldErrors = new { customerCode = "Khách hàng không còn ở trạng thái Hoạt động." } });
        foreach (var item in draft.Services)
        {
            var service = references.Services.FirstOrDefault(s => s.ServiceCode == item.ServiceCode)
                ?? throw new BusinessException("VALIDATION", 422, new { fieldErrors = new { services = "Dịch vụ không tồn tại." } });
            if (service.RequiresArea && string.IsNullOrWhiteSpace(item.AreaCode))
                throw new BusinessException("VALIDATION", 422, new { fieldErrors = new { serviceAreas = new Dictionary<string, string> { [item.Id] = "Chọn khu vực đang Hoạt động." } } });
            if (!string.IsNullOrWhiteSpace(item.AreaCode) &&
                (!references.AreaChains.TryGetValue(item.AreaCode, out var chain) || chain.Count == 0 || chain.Any(a => !a.Active)))
                throw new BusinessException("AREA_INACTIVE", 409, new { fieldErrors = new { serviceAreas = new Dictionary<string, string> { [item.Id] = "Khu vực hoặc khu vực cha đã Tạm ngưng." } }, items = new[] { item.ServiceName } });
        }
        return CustomerSnapshot(customer, true).ToJsonString();
    }

    public Task<JsonObject> Create(Actor actor, CreateContract request, string key, CancellationToken ct)
    {
        if (!actor.IsSalesStaff)
            throw new BusinessException("FORBIDDEN", 403);
        var value = ContractValidator.Validate(request.Draft);
        return Write(actor, "contracts:create", key, request.Draft, async () =>
        {
            var snapshot = await References(request.Draft, ct);
            var code = await _management.SaveDraftAsync(null, actor, request.Draft, value, snapshot, ct);
            return new JsonObject { ["contract"] = await Changed(actor, code, "CONTRACT_CREATED", null, null, ct), ["replayed"] = false };
        }, ct);
    }

    public Task<JsonObject> Update(Actor actor, string code, UpdateContract request, CancellationToken ct)
    {
        var value = ContractValidator.Validate(request.Draft);
        return _management.TransactionAsync(async () =>
        {
            var current = await Locked(actor, code, ct);
            await Editable(actor, current, request.BaseVersion, ct);
            var snapshot = await References(request.Draft, ct);
            await _management.SaveDraftAsync(current.Id, actor, request.Draft, value, snapshot, ct);
            return await Changed(actor, code, "CONTRACT_UPDATED", current, null, ct);
        }, ct);
    }
}
