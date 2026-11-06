using System.Security.Cryptography;
using QTKD.Application.Common.Interfaces;
using QTKD.Application.Features.Contracts;
using QTKD.Domain.Contracts;

namespace QTKD.Infrastructure.Repositories;

public class ContractFileStorage(string uploadRoot) : IContractFileStorage
{
    public async Task<StagedContractFile> StageAsync(Stream content, string filename, long length, CancellationToken ct)
    {
        Directory.CreateDirectory(uploadRoot);
        var file = new StagedContractFile { Name = filename, Size = length, StorageKey = Guid.NewGuid().ToString("N") };
        try
        {
            await using var output = new FileStream(Path.Combine(uploadRoot, file.StorageKey), FileMode.CreateNew, FileAccess.Write, FileShare.None);
            using var hash = IncrementalHash.CreateHash(HashAlgorithmName.SHA256);
            var buffer = new byte[81920];
            long total = 0;
            int read;
            while ((read = await content.ReadAsync(buffer, ct)) > 0)
            {
                total += read;
                if (total > length || total > 20 * 1024 * 1024)
                    throw new BusinessException("INVALID_FILE", 422);
                hash.AppendData(buffer, 0, read);
                await output.WriteAsync(buffer.AsMemory(0, read), ct);
            }
            if (total != length)
                throw new BusinessException("INVALID_FILE", 422);
            file.Fingerprint = Convert.ToHexString(hash.GetHashAndReset());
            return file;
        }
        catch
        {
            Discard(file);
            throw;
        }
    }

    public void Discard(StagedContractFile file)
    {
        if (!Guid.TryParseExact(file.StorageKey, "N", out _))
            return;
        var path = Path.Combine(uploadRoot, file.StorageKey);
        if (File.Exists(path))
            File.Delete(path);
    }

    public Stream Open(FileMetadata file)
    {
        if (!Guid.TryParseExact(file.StorageKey, "N", out _))
            throw new BusinessException("FILE_UNAVAILABLE", 404);
        try
        {
            return new FileStream(Path.Combine(uploadRoot, file.StorageKey), FileMode.Open, FileAccess.Read, FileShare.Read);
        }
        catch (FileNotFoundException)
        {
            throw new BusinessException("FILE_UNAVAILABLE", 404);
        }
        catch (DirectoryNotFoundException)
        {
            throw new BusinessException("FILE_UNAVAILABLE", 404);
        }
    }
}
