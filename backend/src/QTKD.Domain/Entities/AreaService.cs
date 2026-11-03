namespace QTKD.Domain.Entities;

public class AreaService
{
    public Guid AreaId { get; set; }
    public Guid ServiceId { get; set; }

    public Area Area { get; set; } = null!;
    public Service Service { get; set; } = null!;
}

