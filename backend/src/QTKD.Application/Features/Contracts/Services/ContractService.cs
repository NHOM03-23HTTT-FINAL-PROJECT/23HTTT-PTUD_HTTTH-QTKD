using System.Text.Json.Nodes;
using QTKD.Application.Common.Interfaces;
using QTKD.Domain.Contracts;

namespace QTKD.Application.Features.Contracts;

public class ContractService
{
    private readonly IContractStore _store;

    public ContractService(IContractStore store)
    {
        _store = store;
    }

    public Task<JsonObject> Options(Actor actor, CancellationToken ct) =>
        _store.FormOptions(actor, ct);

    public Task<JsonObject> Filters(Actor actor, CancellationToken ct) =>
        _store.FilterOptions(actor, ct);

    public Task<JsonObject> List(Actor actor, ContractQuery query, CancellationToken ct) =>
        _store.List(actor, query, ct);

    public async Task<JsonObject> Get(Actor actor, string code, CancellationToken ct) =>
        (await _store.Get(actor, code, ct)).Data;

    public Task<JsonObject> Cancel(Actor actor, string code, CancelContract request, string key, CancellationToken ct)
    {
        ContractValidator.Reason(request.Reason);
        return _store.Cancel(actor, code, request, Key(key), ct);
    }

    public Task<JsonObject> RequestCancellation(Actor actor, string code, CancellationDraft request, string key, CancellationToken ct)
    {
        ContractValidator.Reason(request.Reason);
        return _store.RequestCancellation(actor, code, request, Key(key), ct);
    }

    public Task<JsonObject> DecideCancellation(Actor actor, string code, Guid id, CancellationDecision request, string key, CancellationToken ct) =>
        _store.DecideCancellation(actor, code, id, request, Key(key), ct);

    public Task<JsonObject> Upload(Actor actor, string code, int version, string key, Stream content, string filename, long length, CancellationToken ct) =>
        _store.Upload(actor, code, version, Key(key), content, filename, length, ct);

    public Task<JsonObject> RemoveFile(Actor actor, string code, Guid id, int version, string key, CancellationToken ct) =>
        _store.RemoveFile(actor, code, id, version, Key(key), ct);

    public Task<(FileMetadata File, Stream Content)> Download(Actor actor, string code, Guid id, CancellationToken ct) =>
        _store.Download(actor, code, id, ct);

    public Task<JsonObject> Create(
        Actor actor,
        CreateContract request,
        string key,
        CancellationToken ct)
    {
        if (!actor.IsSalesStaff)
        {
            throw new BusinessException("FORBIDDEN", 403);
        }

        var value = ContractValidator.Validate(request.Draft);
        return _store.Create(actor, request.Draft, value, Key(key), ct);
    }

    public Task<JsonObject> Update(Actor actor, string code, UpdateContract request, CancellationToken ct) =>
        _store.Update(actor, code, request, ContractValidator.Validate(request.Draft), ct);

    public static string Key(string? key)
    {
        if (string.IsNullOrWhiteSpace(key) || key.Length > 128)
        {
            throw new BusinessException("IDEMPOTENCY_KEY_REQUIRED", 400);
        }

        return key;
    }
}
