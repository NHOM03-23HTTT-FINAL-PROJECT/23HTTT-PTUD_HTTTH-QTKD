using QTKD.Domain.Contracts;

namespace QTKD.Application.Common.Interfaces;

public interface ICurrentActor
{
    Task<Actor> Get(CancellationToken ct);
}
