using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using QTKD.Application.Features.ContractApprovals;
using Xunit;

namespace QTKD.IntegrationTests;

/// <summary>SYS-CTR-10 · luật phân công người duyệt (không cần DB).</summary>
public sealed class AssignmentRulesTests
{
    private static readonly IReadOnlyDictionary<string, string> RoleDepartments =
        new Dictionary<string, string> { ["SalesManager"] = "KD", ["LegalStaff"] = "PC", ["BoardMember"] = "BGD" };

    /// <summary>Hồ sơ 3 bước; states theo thứ tự sales, legal, board.</summary>
    private static ReviewDocument Document(string department, params (string State, string? Decision, bool Assigned)[] states)
    {
        var keys = new[] { "sales", "legal", "board" };
        var steps = keys.Select((key, i) => new ReviewStep(Guid.NewGuid(), key, i + 1, states[i].Assigned ? Guid.NewGuid() : null, null,
            states[i].State, states[i].Decision, null, null, null, RequiresHandoff: key == "legal")).ToArray();
        return new(Guid.NewGuid(), "Hợp đồng", "Khách hàng", "Người lập", department, 1000, "under-review", 1,
            Guid.NewGuid(), 1, 1, "in-progress", DateTime.UtcNow, steps, "", "", []);
    }

    [Fact]
    public void Each_department_head_manages_only_the_step_of_their_department()
    {
        var document = Document("KD", ("pending-accept", null, true), ("waiting", null, true), ("waiting", null, true));
        Assert.Equal(["sales"], AssignmentRules.ManagedSteps(document, new HashSet<string> { "KD" }, RoleDepartments));
        Assert.Equal(["legal"], AssignmentRules.ManagedSteps(document, new HashSet<string> { "PC" }, RoleDepartments));
        Assert.Equal(["board"], AssignmentRules.ManagedSteps(document, new HashSet<string> { "BGD" }, RoleDepartments));
        // Trưởng phòng kinh doanh khác không quản lý hồ sơ của phòng KD.
        Assert.Empty(AssignmentRules.ManagedSteps(document, new HashSet<string> { "KD2" }, RoleDepartments));
    }

    [Theory]
    [InlineData("unassigned", null, true)]
    [InlineData("waiting", null, true)]
    [InlineData("pending-accept", null, true)]
    [InlineData("reviewing", null, false)]
    [InlineData("done", "approve", false)]
    [InlineData("stopped", null, false)]
    public void Only_steps_not_started_can_be_assigned_or_reassigned(string state, string? decision, bool allowed)
    {
        var document = Document("KD", (state, decision, true), ("waiting", null, true), ("waiting", null, true));
        Assert.Equal(allowed, AssignmentRules.CanAssign(document, document.Steps[0]));
    }

    [Fact]
    public void Finished_round_cannot_be_assigned()
    {
        var document = Document("KD", ("waiting", null, true), ("waiting", null, true), ("waiting", null, true)) with { RoundResult = "rejected" };
        Assert.False(AssignmentRules.CanAssign(document, document.Steps[1]));
    }

    [Fact]
    public void Unassigned_current_step_activates_but_board_still_waits_for_legal_handoff()
    {
        // Bước đầu trống người → Pending (chờ tiếp nhận).
        var first = Document("KD", ("unassigned", null, false), ("waiting", null, true), ("waiting", null, true));
        Assert.True(AssignmentRules.ActivatesOnAssign(first, first.Steps[0]));
        Assert.Equal("Pending", AssignmentRules.StatusAfterAssign(first.Steps[0], true));

        // Kinh doanh đã chấp thuận, Pháp chế trống người → gán xong vào rà soát ngay.
        var legal = Document("KD", ("done", "approve", true), ("unassigned", null, false), ("waiting", null, true));
        Assert.True(AssignmentRules.ActivatesOnAssign(legal, legal.Steps[1]));
        Assert.Equal("Reviewing", AssignmentRules.StatusAfterAssign(legal.Steps[1], true));

        // Pháp chế đã chấp thuận nhưng BGĐ phải chờ Pháp chế bàn giao.
        var board = Document("KD", ("done", "approve", true), ("done", "approve", true), ("unassigned", null, false));
        Assert.False(AssignmentRules.ActivatesOnAssign(board, board.Steps[2]));
        Assert.Equal("NotStarted", AssignmentRules.StatusAfterAssign(board.Steps[2], false));

        // Bước sau chưa tới lượt thì chỉ ghi người được phân công.
        var later = Document("KD", ("reviewing", null, true), ("unassigned", null, false), ("waiting", null, true));
        Assert.False(AssignmentRules.ActivatesOnAssign(later, later.Steps[1]));
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

    [Fact]
    public void Reassigning_a_step_waiting_for_acceptance_keeps_it_pending()
    {
        var document = Document("KD", ("pending-accept", null, true), ("waiting", null, true), ("waiting", null, true));
        Assert.False(AssignmentRules.ActivatesOnAssign(document, document.Steps[0]));
        Assert.Equal("Pending", AssignmentRules.StatusAfterAssign(document.Steps[0], false));
    }
}

/// <summary>SYS-CTR-10 · quyền truy cập API phân công (pipeline HTTP, JWT và policy thật).</summary>
public sealed class ApprovalAssignmentApiTests : IDisposable
{
    private readonly ApiFactory factory = new();
    public void Dispose() => factory.Dispose();

    [Fact]
    public async Task Anonymous_is_401_and_user_without_approvals_assign_is_403()
    {
        var client = await factory.Client();
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/v1/approvals/assignments")).StatusCode);

        var login = await client.PostAsJsonAsync("/api/v1/auth/login", new { identifier = factory.Prefix + ".staff", password = factory.Password });
        login.EnsureSuccessStatusCode();
        var auth = await login.Content.ReadFromJsonAsync<JsonElement>();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", auth.GetProperty("accessToken").GetString());

        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync("/api/v1/approvals/assignments")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync($"/api/v1/approvals/contracts/{Guid.NewGuid()}/candidates?step=sales")).StatusCode);
        var assign = await client.PostAsJsonAsync($"/api/v1/approvals/contracts/{Guid.NewGuid()}/assignment",
            new { roundId = Guid.NewGuid(), stepId = Guid.NewGuid(), viewedVersion = 1, assigneeId = Guid.NewGuid() });
        Assert.Equal(HttpStatusCode.Forbidden, assign.StatusCode);
    }
}
