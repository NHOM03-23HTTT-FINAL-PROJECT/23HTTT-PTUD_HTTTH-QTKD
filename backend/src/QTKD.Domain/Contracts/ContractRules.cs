namespace QTKD.Domain.Contracts;

public class BusinessException : Exception
{
    public BusinessException(string code, int status = 409, object? details = null)
        : base(code)
    {
        Code = code;
        Status = status;
        Details = details;
    }

    public string Code { get; }

    public int Status { get; }

    public object? Details { get; }
}

public class Actor
{
    public Actor(Guid id, string role, Guid departmentId, string name, Guid? managedDepartmentId = null)
    {
        Id = id;
        Role = role;
        DepartmentId = departmentId;
        Name = name;
        ManagedDepartmentId = managedDepartmentId;
    }

    public Guid Id { get; set; }

    public string Role { get; set; }

    public Guid DepartmentId { get; set; }

    public string Name { get; set; }

    public Guid? ManagedDepartmentId { get; set; }

    public bool IsSalesStaff => Role == "SalesStaff";

    public bool CanViewContracts => Role is "SalesStaff" or "SalesManager" or "LegalStaff" or "BoardMember";
}

public static class ContractRules
{
    public static void RequireOwner(Actor actor, Guid ownerId)
    {
        if (!actor.IsSalesStaff || actor.Id != ownerId)
        {
            throw new BusinessException("NOT_OWNER", 403);
        }
    }

    public static void RequireEditable(string status)
    {
        if (status is not ("Draft" or "RevisionRequested"))
        {
            throw new BusinessException("STATUS", 409, new
            {
                status = ToClientStatus(status)
            });
        }
    }

    public static void RequireVersion(int actual, int expected)
    {
        if (actual != expected)
        {
            throw new BusinessException("CONFLICT");
        }
    }

    public static void RequireCancellationRequest(string status, bool signed)
    {
        if (signed || status is not ("Submitted" or "UnderReview" or "RevisionRequested" or "Approved"))
        {
            throw new BusinessException("STATUS", 409, new
            {
                status = ToClientStatus(status)
            });
        }
    }

    public static string ToClientStatus(string status) => status switch
    {
        "UnderReview" => "under-review",
        "RevisionRequested" => "revision-requested",
        _ => status.ToLowerInvariant()
    };
}
