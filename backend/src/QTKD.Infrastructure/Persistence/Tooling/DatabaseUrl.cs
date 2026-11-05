using System.Net.Sockets;
using System.Security.Authentication;
using System.Text.RegularExpressions;
using Npgsql;

namespace QTKD.Infrastructure.Persistence.Tooling;

/// <summary>
/// Turns DIRECT_URL (postgresql://user:password@host:5432/db?schema=qtkd&amp;sslmode=...) into an Npgsql connection
/// string, refusing anything but Supabase Direct/Session (port 5432) unless the caller explicitly asks for a disposable
/// local database. Error messages never contain the URI or password.
/// </summary>
public static partial class DatabaseUrl
{
    public static NpgsqlConnectionStringBuilder Require(string? raw, bool allowDisposableLocal = false, string? baseDirectory = null)
    {
        if (string.IsNullOrWhiteSpace(raw)) throw new InvalidOperationException("Chưa có DIRECT_URL. Các lệnh kiểm tra offline vẫn chạy được.");
        if (!Uri.TryCreate(raw, UriKind.Absolute, out var url) || url.Scheme is not ("postgres" or "postgresql"))
            throw new InvalidOperationException("DIRECT_URL không phải PostgreSQL URI hợp lệ.");
        var query = ParseQuery(url.Query);
        var local = allowDisposableLocal && url.Host is "127.0.0.1" or "localhost";
        var user = Uri.UnescapeDataString(url.UserInfo.Split(':', 2)[0]);
        var password = url.UserInfo.Contains(':') ? Uri.UnescapeDataString(url.UserInfo.Split(':', 2)[1]) : "";
        var sslMode = query.GetValueOrDefault("sslmode") ?? "";

        if (!local)
        {
            if (!SupabaseHost().IsMatch(url.Host) || (!url.IsDefaultPort && url.Port != 5432))
                throw new InvalidOperationException("Dùng Direct connection hoặc Session pooler Supabase cổng 5432; không dùng DB local hay Transaction pooler.");
            if (password.Length == 0 || Placeholder().IsMatch(raw))
                throw new InvalidOperationException("Hãy điền URI thật trong DB/.env; không gửi secret qua chat.");
            if (sslMode is not ("require" or "verify-ca" or "verify-full"))
                throw new InvalidOperationException("DIRECT_URL phải có schema=qtkd và sslmode=require (hoặc verify-full với CA phù hợp).");
        }
        if (query.GetValueOrDefault("schema") != "qtkd")
            throw new InvalidOperationException("DIRECT_URL phải có schema=qtkd và sslmode=require (hoặc verify-full với CA phù hợp).");

        var builder = new NpgsqlConnectionStringBuilder
        {
            Host = url.Host,
            Port = url.IsDefaultPort || url.Port < 0 ? 5432 : url.Port,
            Database = Uri.UnescapeDataString(url.AbsolutePath.TrimStart('/')) is { Length: > 0 } db ? db : "postgres",
            Username = user,
            SearchPath = "qtkd",
            Timeout = 10,
            CommandTimeout = 120,
            SslMode = sslMode switch
            {
                "require" => SslMode.Require,
                "verify-ca" => SslMode.VerifyCA,
                "verify-full" => SslMode.VerifyFull,
                "disable" => SslMode.Disable,
                _ => local ? SslMode.Disable : SslMode.Require,
            },
        };
        if (password.Length > 0) builder.Password = password;
        if (local) builder.Pooling = false;
        if (query.GetValueOrDefault("sslrootcert") is { Length: > 0 } cert)
            builder.RootCertificate = Path.GetFullPath(cert, baseDirectory ?? Environment.CurrentDirectory);
        return builder;
    }

    private static Dictionary<string, string> ParseQuery(string query) => query.TrimStart('?')
        .Split('&', StringSplitOptions.RemoveEmptyEntries)
        .Select(p => p.Split('=', 2))
        .ToDictionary(p => Uri.UnescapeDataString(p[0]), p => p.Length > 1 ? Uri.UnescapeDataString(p[1]) : "");

    [GeneratedRegex(@"^(?:db\.[a-z0-9]+\.supabase\.co|[a-z0-9.-]+\.pooler\.supabase\.com)$")]
    private static partial Regex SupabaseHost();

    [GeneratedRegex("REPLACE|PROJECT_REF", RegexOptions.IgnoreCase)]
    private static partial Regex Placeholder();
}

/// <summary>Safe one-line explanation of a connection failure (port of DB/scripts/check-connection.ts).</summary>
public static class ConnectionDiagnostics
{
    private static readonly Dictionary<string, string> Hints = new()
    {
        ["TLS"] = "TLS trust or hostname check failed. Download the database CA from Supabase Database Settings > SSL Configuration; use sslmode=verify-full and sslrootcert pointing to that file. Copy the exact Direct/Session host; do not replace it with an IP address.",
        ["ENOTFOUND"] = "DNS resolution failed. Check the Connect hostname and DNS/network. Use the exact Session pooler URI (port 5432) if direct IPv6 is unavailable.",
        ["EAI_AGAIN"] = "DNS lookup temporarily failed. Check DNS/network before retrying.",
        ["ENETUNREACH"] = "Network route unavailable. If direct IPv6 is unavailable, use the exact Session pooler URI from Supabase Connect (port 5432).",
        ["ECONNREFUSED"] = "Connection refused. Check project availability, network restrictions and port 5432.",
        ["ETIMEDOUT"] = "Connection timed out. Check network/firewall, project availability and port 5432.",
        ["ENOENT"] = "A configured certificate file was not found. Check sslrootcert; relative paths resolve from the folder of DB/.env.",
        ["28P01"] = "Database authentication failed. Verify the database password, URI encoding and the username for the selected Direct/Session connection.",
        ["28000"] = "Database authentication rejected. Check the exact username and project connection settings.",
    };

    // Never print raw errors: they may contain hostnames, paths or credentials.
    public static string Describe(Exception error)
    {
        var pending = new Queue<Exception>([error]);
        var seen = 0;
        while (pending.Count > 0 && seen++ < 20)
        {
            var item = pending.Dequeue();
            var code = item switch
            {
                PostgresException pg when Hints.ContainsKey(pg.SqlState) => pg.SqlState,
                AuthenticationException => "TLS",
                SocketException { SocketErrorCode: SocketError.HostNotFound or SocketError.NoData } => "ENOTFOUND",
                SocketException { SocketErrorCode: SocketError.TryAgain } => "EAI_AGAIN",
                SocketException { SocketErrorCode: SocketError.NetworkUnreachable or SocketError.HostUnreachable } => "ENETUNREACH",
                SocketException { SocketErrorCode: SocketError.ConnectionRefused } => "ECONNREFUSED",
                SocketException { SocketErrorCode: SocketError.TimedOut } or TimeoutException => "ETIMEDOUT",
                FileNotFoundException or DirectoryNotFoundException => "ENOENT",
                _ => null,
            };
            if (code is not null) return $"FAIL [{code}]: {Hints[code]}";
            if (item is AggregateException aggregate) foreach (var inner in aggregate.InnerExceptions) pending.Enqueue(inner);
            else if (item.InnerException is not null) pending.Enqueue(item.InnerException);
        }
        return "FAIL [UNKNOWN]: Connection/query failed. Check private configuration locally; do not share the URI or raw error. No seed was executed.";
    }
}
