namespace QTKD.Application.Features.ContractApprovals;

/// <summary>Project legacy NotStarted rows without rewriting historical approvals or assignments.</summary>
public static class ApprovalStageState
{
    public static string Project(string status, bool assigned, bool predecessorsApproved, bool running) => status switch
    {
        "Completed" => "done",
        "Skipped" => "stopped",
        "Reviewing" => "reviewing",
        "Pending" => "pending-accept",
        _ when !running => "stopped",
        _ when !predecessorsApproved => "waiting",
        // Older rounds can already have an assignee but still be waiting for a separate legal handoff.
        _ => assigned ? "pending-accept" : "unassigned",
    };
}
