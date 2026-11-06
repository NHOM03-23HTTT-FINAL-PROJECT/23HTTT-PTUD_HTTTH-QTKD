namespace QTKD.Domain.Entities;

public class Service
{
    public Guid ServiceId { get; set; }
    public string ServiceCode { get; set; } = string.Empty;
    public string ServiceName { get; set; } = string.Empty;
    public string Unit { get; set; } = string.Empty;
    public bool IsMandatory { get; set; }
    public bool RequiresArea { get; set; } = true;

    public ICollection<AreaService> AreaServices { get; set; } = new List<AreaService>();
}
