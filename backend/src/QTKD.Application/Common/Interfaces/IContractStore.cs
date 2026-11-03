using System.Text.Json.Nodes;
using QTKD.Application.Features.Contracts;
using QTKD.Domain.Contracts;

namespace QTKD.Application.Common.Interfaces;

public interface IContractStore
{
    Task<JsonObject> FormOptions(Actor actor, CancellationToken ct);

    Task<JsonObject> FilterOptions(Actor actor, CancellationToken ct);

    Task<JsonObject> List(Actor actor, ContractQuery query, CancellationToken ct);

    Task<StoredContract> Get(Actor actor, string code, CancellationToken ct);

    Task<JsonObject> Create(Actor actor, ContractDraft draft, decimal value, string key, CancellationToken ct);

    Task<JsonObject> Update(Actor actor, string code, UpdateContract request, decimal value, CancellationToken ct);

    Task<JsonObject> SubmitCheck(Actor actor, string code, CancellationToken ct);

    Task<JsonObject> Submit(Actor actor, string code, string key, CancellationToken ct);

    Task<JsonObject> Cancel(Actor actor, string code, CancelContract request, string key, CancellationToken ct);

    Task<JsonObject> RequestCancellation(Actor actor, string code, CancellationDraft request, string key, CancellationToken ct);

    Task<JsonObject> DecideCancellation(Actor actor, string code, Guid requestId, CancellationDecision request, string key, CancellationToken ct);

    Task<JsonObject> Upload(Actor actor, string code, int version, string key, Stream content, string filename, long length, CancellationToken ct);

    Task<JsonObject> RemoveFile(Actor actor, string code, Guid id, int version, string key, CancellationToken ct);

    Task<(FileMetadata File, Stream Content)> Download(Actor actor, string code, Guid id, CancellationToken ct);
}
