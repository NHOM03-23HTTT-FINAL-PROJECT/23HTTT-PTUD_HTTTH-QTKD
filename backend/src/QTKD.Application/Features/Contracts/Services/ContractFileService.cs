using System.Text.Json.Nodes;
using QTKD.Application.Common.Interfaces;
using QTKD.Domain.Contracts;

namespace QTKD.Application.Features.Contracts;

public partial class ContractService
{
    public async Task<JsonObject> Upload(Actor actor, string code, int version, string key, Stream content, string filename, long length, CancellationToken ct)
    {
        ViewRole(actor);
        key = Key(key);
        filename = Path.GetFileName(filename.Replace('\\', '/'));
        string[] allowed = [".pdf", ".doc", ".docx", ".xls", ".xlsx", ".jpg", ".jpeg", ".png"];
        if (length is <= 0 or > 20 * 1024 * 1024 || filename.Length is < 1 or > 255 || !allowed.Contains(Path.GetExtension(filename).ToLowerInvariant()))
            throw new BusinessException("INVALID_FILE", 422);
        var storage = _files ?? throw new InvalidOperationException("Contract file storage is not configured.");
        var file = await storage.StageAsync(content, filename, length, ct);
        var keep = false;
        try
        {
            var result = await Write(actor, $"contracts:{code}:upload", key,
                new { version, filename, length, fingerprint = file.Fingerprint }, async () =>
                {
                    var current = await Locked(actor, code, ct);
                    await Editable(actor, current, version, ct);
                    await _management.AddFileAsync(current.Id, actor, file, ct);
                    var next = await Changed(actor, code, "CONTRACT_FILE_ADDED", current, filename, ct);
                    // A lost commit response must not delete a blob whose metadata may have committed.
                    keep = true;
                    return new JsonObject { ["contract"] = next, ["replayed"] = false };
                }, ct);
            keep = result["replayed"]?.GetValue<bool>() != true;
            return result;
        }
        finally
        {
            if (!keep)
                storage.Discard(file);
        }
    }

    public Task<JsonObject> RemoveFile(Actor actor, string code, Guid id, int version, string key, CancellationToken ct) =>
        Write(actor, $"contracts:{code}:file:{id}:delete", key, new { version }, async () =>
        {
            var current = await Locked(actor, code, ct);
            await Editable(actor, current, version, ct);
            var file = await _management.FileAsync(current.Id, id, ct) ?? throw new BusinessException("NOT_FOUND", 404);
            await _management.RemoveFileAsync(current.Id, id, ct);
            return new JsonObject { ["contract"] = await Changed(actor, code, "CONTRACT_FILE_REMOVED", current, file.Name, ct), ["replayed"] = false };
        }, ct);

    public async Task<(FileMetadata File, Stream Content)> Download(Actor actor, string code, Guid id, CancellationToken ct)
    {
        ViewRole(actor);
        var current = await Find(actor, code, ct);
        var file = await _management.FileAsync(current.Id, id, ct) ?? throw new BusinessException("NOT_FOUND", 404);
        return (file, (_files ?? throw new InvalidOperationException("Contract file storage is not configured.")).Open(file));
    }
}
