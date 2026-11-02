using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;
using QTKD.Domain.Identity;

namespace QTKD.Infrastructure.Identity;

public sealed class TokenIssuer(IOptionsMonitor<TokenOptions> options, TimeProvider clock)
{
    public (string Token, DateTime ExpiresAt) Issue(UserAccount user, LoginSession session)
    {
        var now = clock.GetUtcNow().UtcDateTime;
        var config = options.CurrentValue;
        var expires = new[] { now.AddMinutes(config.AccessMinutes), session.ExpiresAt }.Min();
        var token = new JwtSecurityToken(config.Issuer, config.Audience,
        [new("sub", user.UserId.ToString()), new("sid", session.SessionId.ToString()),
         new("jti", Guid.NewGuid().ToString()), new("iat", new DateTimeOffset(now).ToUnixTimeSeconds().ToString(), ClaimValueTypes.Integer64)],
            now, expires, new SigningCredentials(new SymmetricSecurityKey(Encoding.UTF8.GetBytes(config.SigningKey)), SecurityAlgorithms.HmacSha256));
        return (new JwtSecurityTokenHandler().WriteToken(token), expires);
    }
    public static string NewRefresh() => Convert.ToHexString(RandomNumberGenerator.GetBytes(32));
    public static string NewSessionToken() => NewRefresh() + "." + NewRefresh();
    public static bool IsSessionToken(string? token) => token is { Length: 129 } && token[64] == '.'
        && token[..64].All(Uri.IsHexDigit) && token[65..].All(Uri.IsHexDigit);
    public static string Hash(string token) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(token)));
}
