using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using QTKD.Application.Common.Interfaces;
using QTKD.Domain.Customers;
using QTKD.Domain.Identity;
using static QTKD.Application.Features.Customers.CustomerValidator;

namespace QTKD.Application.Features.Customers;

public sealed partial class CustomerService(ICustomerRepository repository, ICustomerStatusSource statusSource)
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);
    private static string Hash(object value) => Convert.ToHexString(SHA256.HashData(JsonSerializer.SerializeToUtf8Bytes(value, Json)));
    private static string Code(string code) => Regex.IsMatch(code, "^KH-[0-9]{6,19}$", RegexOptions.CultureInvariant)
        ? code : throw new CustomerFailure(404, "NOT_FOUND");
    private static string Status(string value) => value == "Active" ? "active" : "suspended";
    private async Task<CustomerActor> Actor(Guid id, CancellationToken ct) =>
        await repository.Actor(id, ct) ?? throw new CustomerFailure(403, "FORBIDDEN");
    private async Task<CustomerActor> Authorize(Guid id, Guid session, string permission, CancellationToken ct, bool exclusive = false)
    {
        var actor = await repository.AuthorizeMutation(id, session, permission, exclusive, ct)
            ?? throw new CustomerFailure(403, "FORBIDDEN");
        if (!await repository.SessionValid(id, session, ct)) throw new CustomerFailure(401, "SESSION_ENDED");
        return actor;
    }
    private async Task<CustomerRecord> Find(CustomerActor actor, string code, CancellationToken ct, bool locked = false) =>
        await repository.Find(actor.DepartmentId, Code(code), locked, ct) ?? throw new CustomerFailure(404, "NOT_FOUND");
    private async Task<CustomerRecord> Find(CustomerActor actor, Guid id, CancellationToken ct) =>
        await repository.Find(actor.DepartmentId, id, ct) ?? throw new CustomerFailure(404, "NOT_FOUND");
    private static void MayEdit(CustomerActor actor, CustomerRecord row)
    {
        if (actor.Role != UserRole.SalesManager && row.OwnerId != actor.Id) throw new CustomerFailure(403, "FORBIDDEN");
    }
    private async Task<CustomerView> View(CustomerRecord row, CancellationToken ct)
    {
        var history = (await repository.History(row.Id, ct))
            .Select(s => JsonSerializer.Deserialize<CustomerHistory>(s, Json)).OfType<CustomerHistory>().ToArray();
        var decisions = (await repository.Decisions(row.Id, ct))
            .Select(d => new CustomerDecisionView(d.Type, d.Reason, d.Basis, d.Plan, d.By, d.At)).ToArray();
        return new(row.Code, row.Name, row.TaxCode, row.Address, row.Representative, row.ContactName, row.ContactTitle,
            row.Phone, row.Email, row.Group, row.Services, Status(row.Status), row.OwnerId, row.OwnerName, row.Version,
            row.CreatedAt, row.CreatedBy, history, row.LegacyInterestedServices, decisions);
    }
    private async Task<T?> Replay<T>(Guid actor, string operation, string key, string hash, Guid? customer, CancellationToken ct)
        where T : class
    {
        var receipt = await repository.Receipt(actor, operation, key, ct);
        if (receipt is null) return null;
        if (receipt.Hash != hash || customer is { } id && id != receipt.CustomerId)
            throw new CustomerFailure(409, "IDEMPOTENCY_KEY_REUSED");
        return JsonSerializer.Deserialize<T>(receipt.Response, Json)!;
    }
    private static CustomerValues Values(CustomerDraft d) => new(d.Name!, d.TaxCode!, d.Address!, d.Representative!,
        d.ContactName!, d.ContactTitle!, d.Phone!, d.Email!, d.CustomerGroup!, d.ServiceGroups!);
    private Task Receipt(Guid actor, string operation, string key, string hash, Guid customer, object response, CancellationToken ct) =>
        repository.SaveReceipt(actor, operation, key, hash, customer, JsonSerializer.Serialize(response, Json), ct);
    private Task Audit(Guid actor, Guid customer, string action, CustomerHistory history, CancellationToken ct) =>
        repository.Audit(actor, customer, "Customer", action, JsonSerializer.Serialize(history, Json), history.Reason, ct);
    private static string Fold(string value) => new string(value.Trim().ToLowerInvariant().Normalize(NormalizationForm.FormD)
        .Where(c => CharUnicodeInfo.GetUnicodeCategory(c) != UnicodeCategory.NonSpacingMark)
        .Select(c => c == 'đ' ? 'd' : c).ToArray()).Normalize(NormalizationForm.FormC);

    public async Task<CustomerView> Get(Guid actorId, string code, CancellationToken ct) =>
        await View(await Find(await Actor(actorId, ct), code, ct), ct);

    public async Task<CustomerSearchResult> Search(Guid actorId, string? keyword, string? status, string? sort, int page, int size, CancellationToken ct)
    {
        if (page < 1 || !new[] { 8, 20, 50 }.Contains(size) || !new[] { "all", "active", "suspended" }.Contains(status)
            || !new[] { "updated-desc", "name-asc", "code-asc" }.Contains(sort) || (keyword?.Length ?? 0) > 200)
            throw new CustomerFailure(400, "INVALID_QUERY");
        var actor = await Actor(actorId, ct);
        await using var tx = await repository.Begin(ct, repeatableRead: true);
        var result = await repository.Search(actor.DepartmentId, Fold(keyword ?? ""), status!, sort!, page, size, ct);
        await tx.Commit(ct);
        return new(result.Items.Select(r => new CustomerListItem(r.Code, r.Name, r.Address, r.TaxCode, Status(r.Status), r.UpdatedAt)).ToArray(),
            result.Total, page, size);
    }

    public async Task<CreateCustomerResult> Create(Guid actorId, Guid sessionId, string key, CreateCustomerRequest request, CancellationToken ct)
    {
        Key(key); var hash = Hash(request);
        await using var tx = await repository.Begin(ct);
        var actor = await Authorize(actorId, sessionId, "customers.create", ct);
        await repository.LockRequest(actorId, "create", key, ct);
        var replay = await Replay<CreateCustomerResult>(actorId, "create", key, hash, null, ct);
        if (replay is not null)
        {
            // Recheck visibility before replaying a previously stored response.
            await Find(actor, replay.Customer.Code, ct);
            await tx.Commit(ct); return replay with { Replayed = true };
        }
        var inserted = await repository.Insert(actor, Values(Validate(request.Draft)), ct);
        if (inserted.Id is not { } id)
        {
            var duplicate = inserted.Duplicate;
            var existing = duplicate is null ? null : new DuplicateCustomerReference(duplicate.Code, duplicate.Name, duplicate.TaxCode, Status(duplicate.Status));
            throw new CustomerFailure(409, "DUPLICATE_TAX_CODE", new { existing });
        }
        var row = await Find(actor, id, ct);
        await Audit(actorId, id, "CUSTOMER_CREATED", new("Tạo hồ sơ khách hàng", actor.Name, await repository.Now(ct), row.Version), ct);
        var response = new CreateCustomerResult(await View(row, ct), false);
        await Receipt(actorId, "create", key, hash, id, response, ct);
        await tx.Commit(ct); return response;
    }

    public async Task<UpdateCustomerResult> Update(Guid actorId, Guid sessionId, string code, string key, UpdateCustomerRequest request, CancellationToken ct)
    {
        Key(key); var customerCode = Code(code); var hash = Hash(request);
        if (request.Draft?.TaxCode is not null) throw new CustomerFailure(400, "IMMUTABLE_FIELD");
        await using var tx = await repository.Begin(ct);
        var actor = await Authorize(actorId, sessionId, "customers.update", ct);
        await repository.LockRequest(actorId, "update", key, ct);
        var row = await Find(actor, customerCode, ct, locked: true); MayEdit(actor, row);
        var replay = await Replay<UpdateCustomerResult>(actorId, "update", key, hash, row.Id, ct);
        if (replay is not null) { await tx.Commit(ct); return replay with { Replayed = true }; }
        if (request.BaseVersion != row.Version)
            throw new CustomerFailure(409, "CONFLICT", new { latest = await View(row, ct) });
        var reason = RequiredReason(request.Reason);
        var d = Validate(request.Draft, row.TaxCode, row.Group);
        var changes = new List<CustomerChange>();
        void Change(string field, string before, string after) { if (before != after) changes.Add(new(field, before, after)); }
        Change("name", row.Name, d.Name!); Change("address", row.Address, d.Address!); Change("representative", row.Representative, d.Representative!);
        Change("contactName", row.ContactName, d.ContactName!); Change("contactTitle", row.ContactTitle, d.ContactTitle!);
        Change("phone", row.Phone, d.Phone!); Change("email", row.Email, d.Email!); Change("customerGroup", row.Group, d.CustomerGroup!);
        if (!row.Services.SequenceEqual(d.ServiceGroups!)) changes.Add(new("serviceGroups", row.Services, d.ServiceGroups!));
        if (changes.Count == 0) throw new CustomerFailure(400, "NO_CHANGES");
        await repository.Update(row.Id, Values(d), ct);
        var updated = await Find(actor, row.Id, ct);
        await Audit(actorId, row.Id, "CUSTOMER_UPDATED", new("Cập nhật thông tin", actor.Name, await repository.Now(ct),
            updated.Version, row.Version, reason, changes.ToArray()), ct);
        var response = new UpdateCustomerResult(await View(updated, ct), changes.Select(c => c.Field).ToArray(), false);
        await Receipt(actorId, "update", key, hash, row.Id, response, ct);
        await tx.Commit(ct); return response;
    }
}
