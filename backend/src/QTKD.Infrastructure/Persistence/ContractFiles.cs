using System.Security.Cryptography;
using System.Text.Json.Nodes;
using QTKD.Application.Features.Contracts;
using QTKD.Domain.Contracts;
using static QTKD.Infrastructure.Persistence.PgDatabase;

namespace QTKD.Infrastructure.Persistence;

public partial class PostgresContractStore
{
    public async Task<JsonObject> Upload(
        Actor actor,
        string code,
        int version,
        string key,
        Stream content,
        string filename,
        long length,
        CancellationToken ct)
    {
        filename = Path.GetFileName(filename.Replace('\\', '/'));
        string[] allowed = [".pdf", ".doc", ".docx", ".xls", ".xlsx", ".jpg", ".jpeg", ".png"];

        if (length is <= 0 or > 20 * 1024 * 1024 ||
            filename.Length is < 1 or > 255 ||
            !allowed.Contains(Path.GetExtension(filename).ToLowerInvariant()))
        {
            throw new BusinessException("INVALID_FILE", 422);
        }

        // Stage outside wwwroot. Never use a client filename as a filesystem path.
        Directory.CreateDirectory(_uploadRoot);
        var storageKey = Guid.NewGuid().ToString("N");
        var target = Path.Combine(_uploadRoot, storageKey);
        var keep = false;

        try
        {
            string fingerprint;
            await using (var output = new FileStream(target, FileMode.CreateNew, FileAccess.Write, FileShare.None))
            {
                using var hash = IncrementalHash.CreateHash(HashAlgorithmName.SHA256);
                var buffer = new byte[81920];
                long total = 0;
                int read;

                while ((read = await content.ReadAsync(buffer, ct)) > 0)
                {
                    total += read;
                    if (total > 20 * 1024 * 1024)
                    {
                        throw new BusinessException("INVALID_FILE", 422);
                    }

                    hash.AppendData(buffer, 0, read);
                    await output.WriteAsync(buffer.AsMemory(0, read), ct);
                }

                if (total != length)
                {
                    throw new BusinessException("INVALID_FILE", 422);
                }

                fingerprint = Convert.ToHexString(hash.GetHashAndReset());
            }

            var result = await Write(
                actor,
                $"contracts:{code}:upload",
                key,
                new
                {
                    version,
                    filename,
                    length,
                    fingerprint
                },
                async (c, tx) =>
                {
                    var current = await Read(c, tx, actor, code, true, ct);
                    ContractRules.RequireOwner(actor, current.OwnerId);
                    ContractRules.RequireEditable(current.Status);
                    ContractRules.RequireVersion(current.Version, version);
                    await NoPendingCancellation(c, tx, current.Id, ct);

                    await Execute(c, tx, """
                        INSERT INTO qtkd.attachment(record_type, contract_id, file_name, file_path, uploaded_by, file_size, content_type)
                        VALUES('Contract', $1, $2, $3, $4, $5, 'application/octet-stream')
                        """, ct, current.Id, filename, storageKey, actor.Id, length);

                    await Execute(c, tx, "UPDATE qtkd.contract SET version = version + 1 WHERE contract_id = $1", ct, current.Id);

                    var next = await Read(c, tx, actor, code, false, ct);
                    await Audit(c, tx, actor, current.Id, "CONTRACT_FILE_ADDED", current.Status, current.Status, current.Data, next.Data, filename, ct);

                    // A lost COMMIT response must not delete a blob that may already have committed metadata.
                    keep = true;
                    return new JsonObject
                    {
                        ["contract"] = next.Data,
                        ["replayed"] = false
                    };
                },
                ct);

            keep = result["replayed"]?.GetValue<bool>() != true;
            return result;
        }
        finally
        {
            if (!keep && File.Exists(target))
            {
                File.Delete(target);
            }
        }
    }

    public Task<JsonObject> RemoveFile(
        Actor actor,
        string code,
        Guid id,
        int version,
        string key,
        CancellationToken ct) =>
        Write(
            actor,
            $"contracts:{code}:file:{id}:delete",
            key,
            new
            {
                version
            },
            async (c, tx) =>
            {
                var current = await Read(c, tx, actor, code, true, ct);
                ContractRules.RequireOwner(actor, current.OwnerId);
                ContractRules.RequireEditable(current.Status);
                ContractRules.RequireVersion(current.Version, version);
                await NoPendingCancellation(c, tx, current.Id, ct);

                var file = await Object(
                    c,
                    tx,
                    "SELECT to_jsonb(a) FROM qtkd.attachment a WHERE attachment_id = $1 AND contract_id = $2 FOR UPDATE",
                    ct,
                    id,
                    current.Id) ?? throw new BusinessException("NOT_FOUND", 404);

                await Execute(c, tx, "DELETE FROM qtkd.attachment WHERE attachment_id = $1 AND contract_id = $2", ct, id, current.Id);
                await Execute(c, tx, "UPDATE qtkd.contract SET version = version + 1 WHERE contract_id = $1", ct, current.Id);

                var next = await Read(c, tx, actor, code, false, ct);
                await Audit(
                    c,
                    tx,
                    actor,
                    current.Id,
                    "CONTRACT_FILE_REMOVED",
                    current.Status,
                    current.Status,
                    current.Data,
                    next.Data,
                    file["file_name"]!.GetValue<string>(),
                    ct);

                // Keep the private blob for retention; only the active link is removed. No deleted blob can be downloaded through the API.
                return new JsonObject
                {
                    ["contract"] = next.Data,
                    ["replayed"] = false
                };
            },
            ct);

    public async Task<(FileMetadata File, Stream Content)> Download(Actor actor, string code, Guid id, CancellationToken ct)
    {
        await using var c = await _db.Open(ct);
        var current = await Read(c, null, actor, code, false, ct);

        var file = await Object(
            c,
            null,
            "SELECT to_jsonb(a) FROM qtkd.attachment a WHERE attachment_id = $1 AND contract_id = $2",
            ct,
            id,
            current.Id) ?? throw new BusinessException("NOT_FOUND", 404);

        var storageKey = file["file_path"]!.GetValue<string>();
        if (!Guid.TryParseExact(storageKey, "N", out _))
        {
            throw new BusinessException("FILE_UNAVAILABLE", 404);
        }

        var path = Path.Combine(_uploadRoot, storageKey);
        if (!File.Exists(path))
        {
            throw new BusinessException("FILE_UNAVAILABLE", 404);
        }

        return (
            new FileMetadata(id, file["file_name"]!.GetValue<string>(), file["file_size"]!.GetValue<long>(), "application/octet-stream", storageKey),
            new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.Read));
    }
}
