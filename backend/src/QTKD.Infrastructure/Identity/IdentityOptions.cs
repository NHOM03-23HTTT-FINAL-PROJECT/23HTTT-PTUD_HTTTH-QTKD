using System.ComponentModel.DataAnnotations;

namespace QTKD.Infrastructure.Identity;

public sealed class TokenOptions
{
    [Required] public string Issuer { get; set; } = "qtkd-api";
    [Required] public string Audience { get; set; } = "qtkd-web";
    [Required, MinLength(32)] public string SigningKey { get; set; } = "";
    [Range(1, 30)] public int AccessMinutes { get; set; } = 10;
    [Range(1, 60)] public int IdleMinutes { get; set; } = 30;
    [Range(1, 24)] public int AbsoluteHours { get; set; } = 8;
}

public sealed class DatabaseOptions
{
    [Required] public string Identity { get; set; } = "";
}
