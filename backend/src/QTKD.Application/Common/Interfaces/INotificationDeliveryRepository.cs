namespace QTKD.Application.Common.Interfaces;

/// <summary>Publishes committed messages to the durable in-app inbox. No email/SMS transport is involved.</summary>
public interface INotificationDeliveryRepository
{
    Task<int> PublishPendingAsync(int batchSize, Guid? contractId, CancellationToken ct);
}
