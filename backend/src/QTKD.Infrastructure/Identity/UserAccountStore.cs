using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using QTKD.Domain.Identity;
using QTKD.Infrastructure.Persistence;

namespace QTKD.Infrastructure.Identity;

// All application writes use a per-user transaction; this store doesn't own the scoped DbContext.
public sealed class UserAccountStore(IdentityDbContext db) : IUserPasswordStore<UserAccount>, IUserEmailStore<UserAccount>
{
    public void Dispose() { }
    public Task<string> GetUserIdAsync(UserAccount u, CancellationToken ct) => Task.FromResult(u.UserId.ToString());
    public Task<string?> GetUserNameAsync(UserAccount u, CancellationToken ct) => Task.FromResult<string?>(u.Username);
    public Task SetUserNameAsync(UserAccount u, string? value, CancellationToken ct) { u.Username = value?.Trim().ToLowerInvariant() ?? ""; return Task.CompletedTask; }
    public Task<string?> GetNormalizedUserNameAsync(UserAccount u, CancellationToken ct) => Task.FromResult<string?>(u.Username.ToUpperInvariant());
    public Task SetNormalizedUserNameAsync(UserAccount u, string? value, CancellationToken ct) => Task.CompletedTask;
    public async Task<IdentityResult> CreateAsync(UserAccount u, CancellationToken ct) { db.Users.Add(u); await db.SaveChangesAsync(ct); return IdentityResult.Success; }
    public async Task<IdentityResult> UpdateAsync(UserAccount u, CancellationToken ct) { db.Users.Update(u); await db.SaveChangesAsync(ct); return IdentityResult.Success; }
    public Task<IdentityResult> DeleteAsync(UserAccount u, CancellationToken ct) => throw new NotSupportedException("Disable accounts; preserve references.");
    public Task<UserAccount?> FindByIdAsync(string id, CancellationToken ct) => Guid.TryParse(id, out var key) ? db.Users.SingleOrDefaultAsync(x => x.UserId == key, ct) : Task.FromResult<UserAccount?>(null);
    public Task<UserAccount?> FindByNameAsync(string normalized, CancellationToken ct) { var value = normalized.ToLowerInvariant(); return db.Users.SingleOrDefaultAsync(x => x.Username.ToLower() == value, ct); }
    public Task SetPasswordHashAsync(UserAccount u, string? value, CancellationToken ct) { u.PasswordHash = value ?? ""; return Task.CompletedTask; }
    public Task<string?> GetPasswordHashAsync(UserAccount u, CancellationToken ct) => Task.FromResult<string?>(u.PasswordHash);
    public Task<bool> HasPasswordAsync(UserAccount u, CancellationToken ct) => Task.FromResult(u.PasswordHash.Length > 0);
    public Task SetEmailAsync(UserAccount u, string? value, CancellationToken ct) { u.CompanyEmail = value?.Trim().ToLowerInvariant() ?? ""; return Task.CompletedTask; }
    public Task<string?> GetEmailAsync(UserAccount u, CancellationToken ct) => Task.FromResult<string?>(u.CompanyEmail);
    public Task<bool> GetEmailConfirmedAsync(UserAccount u, CancellationToken ct) => Task.FromResult(true);
    public Task SetEmailConfirmedAsync(UserAccount u, bool value, CancellationToken ct) => Task.CompletedTask;
    public Task<UserAccount?> FindByEmailAsync(string normalized, CancellationToken ct) { var value = normalized.ToLowerInvariant(); return db.Users.SingleOrDefaultAsync(x => x.CompanyEmail.ToLower() == value, ct); }
    public Task<string?> GetNormalizedEmailAsync(UserAccount u, CancellationToken ct) => Task.FromResult<string?>(u.CompanyEmail.ToUpperInvariant());
    public Task SetNormalizedEmailAsync(UserAccount u, string? value, CancellationToken ct) => Task.CompletedTask;
}

public sealed class BcryptPasswordHasher : IPasswordHasher<UserAccount>
{
    public string HashPassword(UserAccount user, string password) => BCrypt.Net.BCrypt.HashPassword(password, workFactor: 12);
    public PasswordVerificationResult VerifyHashedPassword(UserAccount user, string hash, string password)
    {
        if (System.Text.Encoding.UTF8.GetByteCount(password) > 72 || hash.Length != 60 || !hash.StartsWith("$2"))
            return PasswordVerificationResult.Failed;
        try { return BCrypt.Net.BCrypt.Verify(password, hash) ? PasswordVerificationResult.Success : PasswordVerificationResult.Failed; }
        catch (BCrypt.Net.SaltParseException) { return PasswordVerificationResult.Failed; }
    }
}
