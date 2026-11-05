using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using QTKD.Application.Features.Identity;
using QTKD.Domain.Identity;
using QTKD.Infrastructure.Persistence;
using PasswordOtp = QTKD.Infrastructure.Persistence.Schema.PasswordOtp;

namespace QTKD.Infrastructure.Identity;

public sealed class PasswordRecoveryService(IdentityDbContext db, IPasswordHasher<UserAccount> passwords,
    IOptionsMonitor<TokenOptions> tokens, TimeProvider clock)
{
    internal static readonly TimeSpan OtpLifetime = TimeSpan.FromMinutes(5);
    internal static readonly TimeSpan ResendCooldown = TimeSpan.FromMinutes(1);
    private static readonly TimeSpan SendWindow = TimeSpan.FromMinutes(15);
    private static readonly TimeSpan ResetLifetime = TimeSpan.FromMinutes(10);
    private const int MaxSends = 4;
    private const int MaxAttempts = 5;
    private DateTime Now => clock.GetUtcNow().UtcDateTime;

    internal async Task<RecoveryEmail?> Issue(string identifier, DateTime requestedAt, CancellationToken ct)
    {
        var id = await FindUserId(identifier, ct);
        if (id is null) return null;

        await using var transaction = await db.Database.BeginTransactionAsync(ct);
        var user = await LoadLockedUser(id.Value, ct);
        if (user is null || user.Status == UserStatus.Disabled) return null;

        var now = Now;
        var recent = await db.PasswordOtps.AsNoTracking().Where(x => x.UserId == id
            && (x.SentAt > now - SendWindow || x.FailedCount >= MaxAttempts && x.ExpiresAt > now))
            .OrderByDescending(x => x.SentAt).Take(MaxSends).ToListAsync(ct);
        if (recent.Count >= MaxSends || recent.Any(x => x.SentAt > now - ResendCooldown
            || x.FailedCount >= MaxAttempts && x.ExpiresAt > now)) return null;

        var code = RandomNumberGenerator.GetInt32(1_000_000).ToString("D6", CultureInfo.InvariantCulture);
        var otp = new PasswordOtp { OtpId = Guid.NewGuid(), UserId = user.UserId, SentAt = requestedAt, ExpiresAt = requestedAt + OtpLifetime };
        otp.OtpHash = HashOtp(otp.OtpId, code);
        await db.InvalidatePasswordRecovery(user.UserId, ct);
        db.PasswordOtps.Add(otp);
        await db.SaveChangesAsync(ct);
        await transaction.CommitAsync(ct);
        return new(user.CompanyEmail, code);
    }

    public async Task<VerifyOtpResult> Verify(VerifyOtpRequest request, CancellationToken ct)
    {
        var identifier = NormalizeIdentifier(request.Identifier);
        if (request.Code is not { Length: 6 } code || !code.All(char.IsAsciiDigit)) throw InvalidCode();
        var id = await FindUserId(identifier, ct) ?? throw InvalidCode();

        await using var transaction = await db.Database.BeginTransactionAsync(ct);
        var user = await LoadLockedUser(id, ct);
        if (user is null || user.Status == UserStatus.Disabled) throw InvalidCode();
        var otp = await db.PasswordOtps.Where(x => x.UserId == id && !x.IsUsed)
            .OrderByDescending(x => x.SentAt).FirstOrDefaultAsync(ct);
        if (otp is null || otp.ExpiresAt <= Now || otp.FailedCount >= MaxAttempts) throw InvalidCode();

        if (!Matches(otp.OtpHash, HashOtp(otp.OtpId, code)))
        {
            if (++otp.FailedCount == MaxAttempts)
            {
                otp.IsUsed = true;
                otp.OtpHash = "";
                otp.ExpiresAt = Now + SendWindow;
            }
            await db.SaveChangesAsync(ct);
            await transaction.CommitAsync(ct);
            throw InvalidCode();
        }

        var resetToken = $"{otp.OtpId:N}.{TokenIssuer.NewRefresh()}";
        otp.IsUsed = true;
        otp.OtpHash = HashReset(resetToken);
        otp.ExpiresAt = Now + ResetLifetime;
        await db.SaveChangesAsync(ct);
        await transaction.CommitAsync(ct);
        return new(resetToken, user.CompanyEmail);
    }

    public async Task<ResetPasswordResult> Reset(ResetPasswordRequest request, CancellationToken ct)
    {
        if (request.ResetToken is not { Length: 97 } token || token[32] != '.'
            || !Guid.TryParseExact(token[..32], "N", out var otpId) || !token[33..].All(Uri.IsHexDigit)) throw InvalidToken();
        var id = await db.PasswordOtps.Where(x => x.OtpId == otpId).Select(x => (Guid?)x.UserId).SingleOrDefaultAsync(ct)
            ?? throw InvalidToken();

        await using var transaction = await db.Database.BeginTransactionAsync(ct);
        var user = await LoadLockedUser(id, ct);
        var otp = await db.PasswordOtps.AsNoTracking().SingleAsync(x => x.OtpId == otpId, ct);
        if (user is null || user.Status == UserStatus.Disabled || !otp.IsUsed || otp.ExpiresAt <= Now
            || !Matches(otp.OtpHash, HashReset(token))) throw InvalidToken();

        IdentityService.ValidatePassword(request.NewPassword);
        var password = request.NewPassword!;
        if (passwords.VerifyHashedPassword(user, user.PasswordHash, password) != PasswordVerificationResult.Failed)
            throw new IdentityFailure(400, "SAME_AS_CURRENT");

        user.PasswordHash = passwords.HashPassword(user, password);
        user.PasswordChangedAt = Now;
        user.MustChangePassword = false;
        user.FailedLoginCount = 0;
        user.LockedUntil = null;
        user.Status = UserStatus.Active;
        await db.InvalidatePasswordRecovery(id, ct);
        await db.RevokeSessions(id, "password-changed", ct);
        await db.SaveChangesAsync(ct);
        await transaction.CommitAsync(ct);
        return new(user.Username);
    }

    internal static string NormalizeIdentifier(string? identifier)
    {
        if (string.IsNullOrWhiteSpace(identifier) || identifier.Length > 254) throw new IdentityFailure(400, "VALIDATION");
        return identifier.Trim().ToLowerInvariant();
    }

    private Task<Guid?> FindUserId(string identifier, CancellationToken ct) => db.Users
        .Where(x => x.Username.ToLower() == identifier || x.CompanyEmail.ToLower() == identifier)
        .Select(x => (Guid?)x.UserId).SingleOrDefaultAsync(ct);

    private async Task<UserAccount?> LoadLockedUser(Guid id, CancellationToken ct)
    {
        await db.LockUser(id, ct);
        return await db.Users.SingleOrDefaultAsync(x => x.UserId == id, ct);
    }

    private string HashOtp(Guid id, string code) => "otp:" + Convert.ToHexString(HMACSHA256.HashData(
        Encoding.UTF8.GetBytes(tokens.CurrentValue.SigningKey), Encoding.UTF8.GetBytes($"qtkd/password-otp/{id:N}/{code}")));

    private static string HashReset(string token) => "reset:" + TokenIssuer.Hash(token);
    private static bool Matches(string stored, string expected) => CryptographicOperations.FixedTimeEquals(
        Encoding.UTF8.GetBytes(stored), Encoding.UTF8.GetBytes(expected));

    private static IdentityFailure InvalidCode() => new(400, "INVALID_CODE");
    private static IdentityFailure InvalidToken() => new(400, "TOKEN_EXPIRED");
}
