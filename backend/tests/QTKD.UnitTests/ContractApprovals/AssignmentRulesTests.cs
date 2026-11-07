using QTKD.Application.Features.ContractApprovals;
using Xunit;

namespace QTKD.UnitTests.ContractApprovals;

public sealed class AssignmentRulesTests
{
    internal static readonly IReadOnlyDictionary<string, string> RoleDepartments =
        new Dictionary<string, string> { ["SalesManager"] = "KD", ["LegalStaff"] = "PC", ["BoardMember"] = "BGD" };

    internal static ReviewDocument Document(string department, params (string State, string? Decision, bool Assigned)[] states)
    {
        var keys = new[] { "sales", "legal", "board" };
        var steps = keys.Select((key, i) => new ReviewStep(Guid.NewGuid(), key, i + 1, states[i].Assigned ? Guid.NewGuid() : null, null,
            states[i].State, states[i].Decision, states[i].Decision is null ? null : 1, null, null, RequiresHandoff: key == "legal")).ToArray();
        return new(Guid.NewGuid(), "Hợp đồng", "Khách hàng", "Người lập", department, 1000, "under-review", 1,
            Guid.NewGuid(), 1, 1, "in-progress", DateTime.UtcNow, steps, "", "", []);
    }

    [Fact]
    public void Each_department_head_manages_only_the_step_of_their_department_and_sales_is_never_managed()
    {
        var document = Document("KD", ("pending-accept", null, true), ("waiting", null, true), ("waiting", null, true));
        Assert.Empty(AssignmentRules.ManagedSteps(document, new HashSet<string> { "KD" }, RoleDepartments));
        Assert.Equal(["legal"], AssignmentRules.ManagedSteps(document, new HashSet<string> { "PC" }, RoleDepartments));
        Assert.Equal(["board"], AssignmentRules.ManagedSteps(document, new HashSet<string> { "BGD" }, RoleDepartments));
    }

    [Fact]
    public void Sales_step_has_no_assignment_roles_and_cannot_be_assigned()
    {
        Assert.Equal("VALIDATION", Assert.Throws<ReviewFailure>(() => AssignmentRules.StepRoles("sales")).Code);
        var document = Document("KD", ("waiting", null, true), ("unassigned", null, false), ("unassigned", null, false));
        Assert.False(AssignmentRules.CanAssign(document, document.Steps[0]));
    }

    [Theory]
    [InlineData("unassigned", false, true)]
    [InlineData("unassigned", true, false)]
    [InlineData("waiting", false, false)]
    [InlineData("pending-accept", true, false)]
    [InlineData("reviewing", true, false)]
    [InlineData("done", true, false)]
    public void Only_current_unassigned_steps_can_be_assigned_once(string state, bool assigned, bool allowed)
    {
        var document = Document("KD", ("done", "approve", true), (state, null, assigned), ("waiting", null, false));
        Assert.Equal(allowed, AssignmentRules.CanAssign(document, document.Steps[1]));
    }

    [Fact]
    public void Later_steps_closed_rounds_and_wrong_versions_are_not_assignable()
    {
        var document = Document("KD", ("reviewing", null, true), ("unassigned", null, false), ("unassigned", null, false));
        Assert.False(AssignmentRules.CanAssign(document, document.Steps[1]));
        var ready = Document("KD", ("done", "approve", true), ("unassigned", null, false), ("waiting", null, false));
        Assert.False(AssignmentRules.CanAssign(ready with { RoundResult = "rejected" }, ready.Steps[1]));
        Assert.False(AssignmentRules.CanAssign(ready with { Version = 2 }, ready.Steps[1]));
        var board = Document("KD", ("done", "approve", true), ("done", "approve", true), ("unassigned", null, false));
        Assert.True(AssignmentRules.ActivatesOnAssign(board, board.Steps[2]));
        Assert.Equal("Pending", AssignmentRules.StatusAfterAssign(true));
    }

    [Theory]
    [InlineData("legal", "NV_PC", true)]
    [InlineData("legal", "TP_PC", true)]
    [InlineData("board", "GD", true)]
    [InlineData("board", "TGD", true)]
    [InlineData("legal", "GD", false)]
    [InlineData("board", "TP_PC", false)]
    public void Department_managers_review_their_own_step_like_staff(string step, string role, bool allowed)
    {
        var document = Document("KD", ("done", "approve", true), ("reviewing", null, true), ("waiting", null, true));
        var actorId = document.Steps.Single(s => s.Key == step).AssigneeId!.Value;
        var actor = new ReviewActor(actorId, role, step == "legal" ? "PC" : "BGD", ContractApprovalService.Permission(step));
        Assert.Equal(allowed, ContractApprovalService.InScope(actor, document));
        Assert.Contains(step == "legal" ? "LegalManager" : "BoardChair", AssignmentRules.StepRoles(step));
    }
}
