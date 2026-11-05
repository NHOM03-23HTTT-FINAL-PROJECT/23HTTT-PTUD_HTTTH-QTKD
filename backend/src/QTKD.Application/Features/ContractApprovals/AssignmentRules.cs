namespace QTKD.Application.Features.ContractApprovals;

public static class AssignmentRules
{
    public static readonly IReadOnlyList<string> StepKeys = ["sales", "legal", "board"];

    public static IReadOnlyList<string> StepRoles(string step) => step switch
    {
        "sales" => ["SalesManager"],
        "legal" => ["LegalStaff", "LegalManager"],
        "board" => ["BoardMember", "BoardChair"],
        _ => throw new ReviewFailure(400, "VALIDATION"),
    };

    public static string StepLabel(string step) => step switch
    {
        "sales" => "Rà soát kinh doanh",
        "legal" => "Rà soát pháp lý",
        "board" => "Phê duyệt",
        _ => step,
    };

    public static string StepDepartment(ReviewDocument document, string step, IReadOnlyDictionary<string, string> roleDepartments) =>
        step == "sales" ? document.Department : roleDepartments[StepRoles(step)[0]];

    public static IReadOnlyList<string> ManagedSteps(ReviewDocument document, IReadOnlySet<string> managed,
        IReadOnlyDictionary<string, string> roleDepartments) =>
        document.Steps
            .Where(step => StepKeys.Contains(step.Key) && managed.Contains(StepDepartment(document, step.Key, roleDepartments)))
            .Select(step => step.Key)
            .ToArray();

    public static bool CanAssign(ReviewDocument document, ReviewStep step) =>
        document.RoundResult == "in-progress"
        && step.Decision is null
        && step.State is "unassigned" or "waiting" or "pending-accept";

    public static bool ActivatesOnAssign(ReviewDocument document, ReviewStep step)
    {
        if (step.State != "unassigned") return false;
        var previous = document.Steps.Where(s => s.Order < step.Order).OrderBy(s => s.Order).ToArray();
        if (previous.Any(s => s.State != "done" || s.Decision != "approve")) return false;
        return previous.Length == 0 || !previous[^1].RequiresHandoff;
    }

    public static string StatusAfterAssign(ReviewStep step, bool activates) =>
        activates ? (step.Key == "sales" ? "Pending" : "Reviewing")
        : step.State == "pending-accept" ? "Pending"
        : "NotStarted";
}
