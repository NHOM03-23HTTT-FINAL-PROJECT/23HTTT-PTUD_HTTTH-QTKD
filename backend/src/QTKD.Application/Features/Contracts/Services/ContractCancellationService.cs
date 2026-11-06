using System.Text.Json.Nodes;
using QTKD.Domain.Contracts;

namespace QTKD.Application.Features.Contracts;

public partial class ContractService
{
    public Task<JsonObject> Cancel(Actor actor, string code, CancelContract request, string key, CancellationToken ct)
    {
        var reason = ContractValidator.Reason(request.Reason);
        return Write(actor, $"contracts:{code}:cancel", key, request, async () =>
        {
            var current = await Locked(actor, code, ct);
            ContractRules.RequireOwner(actor, current.OwnerId);
            if (current.Status != "Draft")
                throw new BusinessException("STATUS", 409, new { status = ContractRules.ToClientStatus(current.Status) });
            ContractRules.RequireVersion(current.Version, request.BaseVersion);
            await _management.CancelAsync(current.Id, actor.Id, reason, ct);
            return new JsonObject { ["contract"] = await Changed(actor, code, "CONTRACT_CANCELLED", current, reason, ct), ["replayed"] = false };
        }, ct);
    }

    public Task<JsonObject> RequestCancellation(Actor actor, string code, CancellationDraft request, string key, CancellationToken ct)
    {
        var reason = ContractValidator.Reason(request.Reason);
        return Write(actor, $"contracts:{code}:request-cancellation", key, request, async () =>
        {
            var current = await Locked(actor, code, ct);
            ContractRules.RequireOwner(actor, current.OwnerId);
            ContractRules.RequireVersion(current.Version, request.BaseVersion);
            ContractRules.RequireCancellationRequest(current.Status, await _management.HasSignedAsync(current.Id, ct));
            await NoPendingCancellation(current.Id, ct);
            if (request.Party is not ("company" or "customer"))
                throw new BusinessException("VALIDATION", 422);
            var approvers = await _management.ApproversAsync(current.OwningDepartmentId ?? Guid.Empty, ct);
            var sales = approvers.Sales ?? throw new BusinessException("NO_APPROVER");
            var board = current.Status == "Approved" ? approvers.Board ?? throw new BusinessException("NO_APPROVER") : (Guid?)null;
            if (sales == actor.Id || board == actor.Id)
                throw new BusinessException("NO_APPROVER");
            await _management.AddCancellationAsync(current, actor, request.Party, reason, sales, board, ct);
            await _contracts.NotifyAsync(sales, current.Id, $"Đề nghị hủy {code}: {reason}", ct);
            return new JsonObject { ["contract"] = await Changed(actor, code, "CANCELLATION_REQUESTED", current, reason, ct), ["replayed"] = false };
        }, ct);
    }

    public Task<JsonObject> DecideCancellation(Actor actor, string code, Guid id, CancellationDecision request, string key, CancellationToken ct) =>
        Write(actor, $"contracts:{code}:cancellation:{id}:decide", key, request, async () =>
        {
            var current = await Locked(actor, code, ct);
            var pending = await _management.LockCancellationAsync(current.Id, id, ct) ?? throw new BusinessException("NOT_FOUND", 404);
            var sales = pending.Status == "pending-sales";
            if (pending.Status is not ("pending-sales" or "pending-board"))
                throw new BusinessException("STEP_DONE");
            var assignee = sales ? pending.SalesAssigneeId : pending.BoardAssigneeId;
            if (actor.Id != assignee || (sales ? actor.Role != "SalesManager" : actor.Role is not ("BoardMember" or "BoardChair")) ||
                (sales && actor.ManagedDepartmentId != current.OwningDepartmentId))
                throw new BusinessException("NOT_ASSIGNEE", 403);
            ContractRules.RequireVersion(pending.Version, request.BaseVersion);
            if (current.Status != pending.OriginalStatus || current.Version != pending.ContractVersion)
                throw new BusinessException("CONFLICT");
            var reason = request.Approve ? (request.Reason ?? "").Trim() : ContractValidator.Reason(request.Reason);
            if (reason.Length > 4000)
                throw new BusinessException("VALIDATION", 422);
            var needsBoard = sales && pending.BoardAssigneeId != null;
            var finished = request.Approve && !needsBoard;
            if (finished)
            {
                ContractRules.RequireCancellationRequest(current.Status, await _management.HasSignedAsync(current.Id, ct));
                if (await _management.HasRunningSigningAsync(current.Id, ct))
                    throw new BusinessException("SIGNING_CANCELLATION_REQUIRED");
            }
            var status = !request.Approve ? "rejected" : needsBoard ? "pending-board" : "approved";
            await _management.DecideCancellationAsync(id, sales, request.Approve, reason, status, ct);
            if (finished)
            {
                await _management.CancelAsync(current.Id, actor.Id, pending.Reason, ct);
                await _management.StopApprovalRoundsAsync(current.Id, code, ct);
            }
            if (status == "pending-board")
                await _contracts.NotifyAsync(pending.BoardAssigneeId!.Value, current.Id, $"Đề nghị hủy {code} chờ Ban Giám đốc quyết định.", ct);
            if (status is "approved" or "rejected")
            {
                await _contracts.NotifyAsync(current.OwnerId, current.Id, $"Đề nghị hủy {code}: {(finished ? "được chấp thuận" : "không được chấp thuận")}. {reason}", ct);
                var destination = JsonNode.Parse(current.CustomerSnapshot)?["email"]?.GetValue<string>() ?? "";
                await _management.QueueDeliveryAsync(current.Id, id, destination, Object(new { contractCode = code, result = status, reason }).ToJsonString(), ct);
            }
            return new JsonObject { ["contract"] = await Changed(actor, code, "CANCELLATION_DECIDED", current, reason, ct), ["replayed"] = false };
        }, ct);
}
