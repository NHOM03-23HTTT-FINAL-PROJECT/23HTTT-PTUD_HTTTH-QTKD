using Microsoft.Extensions.Options;
using QTKD.Application.Common.Interfaces;

namespace QTKD.Api.BackgroundServices;

public sealed class NotificationDeliveryOptions
{
    public bool Enabled { get; set; } = true;
    public int BatchSize { get; set; } = 100;
    public int PollSeconds { get; set; } = 5;
}

/// <summary>Retries durable in-app publication outside the approval transaction and request lifetime.</summary>
public sealed class NotificationDeliveryWorker(IServiceScopeFactory scopes, IOptions<NotificationDeliveryOptions> options,
    TimeProvider clock, ILogger<NotificationDeliveryWorker> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var settings = options.Value;
        if (!settings.Enabled) return;
        var failures = 0;
        while (!stoppingToken.IsCancellationRequested)
        {
            var delay = TimeSpan.FromSeconds(settings.PollSeconds);
            try
            {
                await using var scope = scopes.CreateAsyncScope();
                var count = await scope.ServiceProvider.GetRequiredService<INotificationDeliveryRepository>()
                    .PublishPendingAsync(settings.BatchSize, null, stoppingToken);
                failures = 0;
                if (count > 0) logger.LogInformation("Published {Count} in-app notifications", count);
                if (count == settings.BatchSize) delay = TimeSpan.Zero;
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { break; }
            catch (Exception error)
            {
                failures = Math.Min(failures + 1, 6);
                delay = TimeSpan.FromSeconds(Math.Min(60, settings.PollSeconds * Math.Pow(2, failures)));
                logger.LogWarning(error, "In-app notification publication failed; committed messages remain queued. Retrying in {Seconds}s", delay.TotalSeconds);
            }
            try { await Task.Delay(delay, clock, stoppingToken); }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { break; }
        }
    }
}
