namespace QTKD.Application.Features.ContractApprovals;

public static class AssignmentRules
{
    public static readonly IReadOnlyList<string> StepKeys = ["legal", "board"];

    public static IReadOnlyList<string> StepRoles(string step) => step switch
    {
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

    public static string StepDepartment(string step, IReadOnlyDictionary<string, string> roleDepartments) =>
        roleDepartments[StepRoles(step)[0]];

    public static IReadOnlyList<string> ManagedSteps(ReviewDocument document, IReadOnlySet<string> managed,
        IReadOnlyDictionary<string, string> roleDepartments) =>
        document.Steps
            .Where(step => StepKeys.Contains(step.Key) && managed.Contains(StepDepartment(step.Key, roleDepartments)))
            .Select(step => step.Key)
            .ToArray();

    public static bool CanAssign(ReviewDocument document, ReviewStep step) =>
        document.RoundResult == "in-progress"
        && document.Status == "under-review"
        && document.Version == document.SubmittedVersion
        && StepKeys.Contains(step.Key)
        && step.AssigneeId is null
        && step.Decision is null
        && step.State == "unassigned"
        && document.Steps.Where(s => s.Order < step.Order).All(s => s.State == "done" && s.Decision == "approve" && s.ReviewedVersion == document.SubmittedVersion);

    public static bool ActivatesOnAssign(ReviewDocument document, ReviewStep step)
    {
        return CanAssign(document, step);
    }

    public static string StatusAfterAssign(bool activates) => activates ? "Pending" : "NotStarted";
}
