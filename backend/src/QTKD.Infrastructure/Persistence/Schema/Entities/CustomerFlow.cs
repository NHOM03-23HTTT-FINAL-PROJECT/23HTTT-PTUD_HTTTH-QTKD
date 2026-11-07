namespace QTKD.Infrastructure.Persistence.Schema;

// Optional structured data is kept separate so legacy customers retain unknown creation metadata.
public sealed class CustomerProfileData
{
    public Guid CustomerId { get; set; }
    public string[]? ServiceGroups { get; set; } = [];
    public DateTime? CreatedAt { get; set; }
    public Guid? CreatedBy { get; set; }
    public DateTime? UpdatedAt { get; set; }
}

public sealed class CustomerOperation
{
    public Guid ActorId { get; set; }
    public string Operation { get; set; } = "";
    public string RequestKey { get; set; } = "";
    public string RequestHash { get; set; } = "";
    public Guid CustomerId { get; set; }
    public string Response { get; set; } = "";
    public DateTime CreatedAt { get; set; }
}

public sealed class CustomerStatusOutbox
{
    public Guid DecisionId { get; set; }
    public string Payload { get; set; } = "";
    public string Status { get; set; } = "Pending";
    public int Attempts { get; set; }
    public DateTime CreatedAt { get; set; }
}

public sealed class CustomerStatusDelegation
{
    public Guid DelegationId { get; set; }
    public Guid GranteeId { get; set; }
    public Guid GrantedBy { get; set; }
    public Guid DepartmentId { get; set; }
    public CustomerDecisionType Action { get; set; }
    public string? Reason { get; set; }
    public DateTime GrantedAt { get; set; }
    public DateTime? ExpiresAt { get; set; }
    public DateTime? RevokedAt { get; set; }
    public Guid? RevokedBy { get; set; }
}
