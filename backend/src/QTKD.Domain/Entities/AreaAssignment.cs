namespace QTKD.Domain.Entities;

public class AreaAssignment
{
    public Guid AssignmentId { get; set; }
    public Guid AreaId { get; set; }
    public Guid UserId { get; set; }
    public DateTime FromDate { get; set; }
    public DateTime? ToDate { get; set; }

    public Area Area { get; set; } = null!;
}
