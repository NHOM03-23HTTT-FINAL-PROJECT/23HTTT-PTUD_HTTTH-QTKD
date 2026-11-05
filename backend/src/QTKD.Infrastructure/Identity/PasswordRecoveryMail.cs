using System.Net;
using System.Net.Mail;
using System.Threading.Channels;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using QTKD.Application.Features.Identity;

namespace QTKD.Infrastructure.Identity;

public sealed class PasswordRecoveryMailOptions
{
    public bool Enabled { get; set; }
    public string Host { get; set; } = "";
    public int Port { get; set; } = 587;
    public string From { get; set; } = "";
    public string Username { get; set; } = "";
    public string Password { get; set; } = "";

    public bool IsValid() => !Enabled || (!string.IsNullOrWhiteSpace(Host) && Port is > 0 and <= 65535
        && MailAddress.TryCreate(From, out _) && (string.IsNullOrEmpty(Username) == string.IsNullOrEmpty(Password)));
}

internal sealed record RecoveryEmail(string Recipient, string Code);

public interface IPasswordRecoveryMailSender
{
    Task Send(string recipient, string code, CancellationToken ct);
}

public sealed class SmtpPasswordRecoveryMailSender(IOptions<PasswordRecoveryMailOptions> options) : IPasswordRecoveryMailSender
{
    public async Task Send(string recipient, string code, CancellationToken ct)
    {
        var settings = options.Value;
        using var client = new SmtpClient(settings.Host, settings.Port) { EnableSsl = true };
        if (!string.IsNullOrEmpty(settings.Username))
            client.Credentials = new NetworkCredential(settings.Username, settings.Password);

        using var message = new MailMessage(settings.From, recipient)
        {
            Subject = "QTKD – Mã xác thực đặt lại mật khẩu",
            Body = $"Mã xác thực của bạn là {code}. Mã có hiệu lực trong 5 phút.\nNếu bạn không yêu cầu đặt lại mật khẩu, hãy bỏ qua email này."
        };
        await client.SendMailAsync(message, ct);
    }
}

public sealed class PasswordRecoveryQueue(IServiceScopeFactory scopes, IPasswordRecoveryMailSender mail,
    IOptions<PasswordRecoveryMailOptions> options, TimeProvider clock, ILogger<PasswordRecoveryQueue> log) : BackgroundService
{
    private readonly Channel<(string Identifier, DateTime RequestedAt)> requests =
        Channel.CreateBounded<(string, DateTime)>(new BoundedChannelOptions(32) { SingleReader = true });

    public OtpDispatch Request(SendOtpRequest request)
    {
        var identifier = PasswordRecoveryService.NormalizeIdentifier(request.Identifier);
        var now = clock.GetUtcNow();
        // Resolve the account and deliver mail outside the HTTP request for all identifiers.
        if (!options.Value.Enabled || !requests.Writer.TryWrite((identifier, now.UtcDateTime)))
            throw new IdentityFailure(503, "EMAIL_FAILED");
        return new((now + PasswordRecoveryService.OtpLifetime).ToUnixTimeMilliseconds(),
            (now + PasswordRecoveryService.ResendCooldown).ToUnixTimeMilliseconds());
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        await foreach (var request in requests.Reader.ReadAllAsync(stoppingToken))
        {
            if (clock.GetUtcNow().UtcDateTime - request.RequestedAt > TimeSpan.FromSeconds(15)) continue;

            try
            {
                await using var scope = scopes.CreateAsyncScope();
                var recovery = scope.ServiceProvider.GetRequiredService<PasswordRecoveryService>();
                using var deadline = CancellationTokenSource.CreateLinkedTokenSource(stoppingToken);
                deadline.CancelAfter(TimeSpan.FromSeconds(8));
                var email = await recovery.Issue(request.Identifier, request.RequestedAt, deadline.Token);
                if (email is not null) await mail.Send(email.Recipient, email.Code, deadline.Token);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                return;
            }
            catch (Exception error)
            {
                log.LogWarning("PASSWORD_RECOVERY_DELIVERY_FAILED {ExceptionType}", error.GetType().Name);
            }
        }
    }
}
