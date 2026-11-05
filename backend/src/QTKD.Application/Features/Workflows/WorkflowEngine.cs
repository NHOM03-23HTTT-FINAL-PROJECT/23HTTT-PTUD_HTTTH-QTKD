namespace QTKD.Application.Features.Workflows;

public sealed record WorkflowTask(Guid Id, int Order, Guid? AssigneeId, string State, string? Decision, bool RequiresHandoff);
public sealed record WorkflowState(string Result, IReadOnlyList<WorkflowTask> Tasks);

/// <summary>Generic ordered workflow. Keys, roles, document statuses and number of steps belong to adapters.</summary>
public sealed class WorkflowEngine
{
    public WorkflowState Apply(WorkflowState state, Guid taskId, Guid actor, string action)
    {
        if (state.Result != "in-progress") throw new InvalidOperationException("STEP_DONE");
        var tasks = state.Tasks.OrderBy(t => t.Order).ToArray();
        if (tasks.Length == 0 || tasks.Select(t => t.Id).Distinct().Count() != tasks.Length
            || tasks.Select(t => t.Order).Distinct().Count() != tasks.Length || tasks.Any(t => t.Order < 1))
            throw new InvalidOperationException("WORKFLOW_CONFIGURATION_INVALID");
        var index = Array.FindIndex(tasks, t => t.Id == taskId);
        if (index < 0) throw new InvalidOperationException("STEP_NOT_READY");
        var task = tasks[index];
        if (task.AssigneeId != actor) throw new UnauthorizedAccessException("NOT_ASSIGNEE");
        if (tasks.Take(index).Any(t => t.State != "done" || t.Decision != "approve")) throw new InvalidOperationException("STEP_NOT_READY");
        if (action == "handoff")
        {
            if (task.State != "done" || task.Decision != "approve" || !task.RequiresHandoff || index == tasks.Length - 1
                || tasks[index + 1].State is not ("waiting" or "unassigned")) throw new InvalidOperationException("STEP_NOT_READY");
            tasks[index + 1] = Activate(tasks[index + 1]);
            return state with { Tasks = tasks };
        }
        if (action == "accept")
        {
            if (task.State != "pending-accept") throw new InvalidOperationException("STEP_NOT_READY");
            tasks[index] = task with { State = "reviewing" };
            return state with { Tasks = tasks };
        }
        if (task.State != "reviewing") throw new InvalidOperationException(task.State == "done" ? "STEP_DONE" : "STEP_NOT_READY");
        if (action is not ("approve" or "revision" or "reject")) throw new ArgumentException("VALIDATION");
        tasks[index] = task with { State = "done", Decision = action };
        if (action != "approve")
        {
            for (var i = index + 1; i < tasks.Length; i++) tasks[i] = tasks[i] with { State = "stopped" };
            return new(action == "revision" ? "revision" : "rejected", tasks);
        }
        if (index == tasks.Length - 1) return new("completed", tasks);
        if (!task.RequiresHandoff) tasks[index + 1] = Activate(tasks[index + 1]);
        return state with { Tasks = tasks };
    }
    private static WorkflowTask Activate(WorkflowTask task) => task with { State = task.AssigneeId is null ? "unassigned" : "reviewing" };
}
