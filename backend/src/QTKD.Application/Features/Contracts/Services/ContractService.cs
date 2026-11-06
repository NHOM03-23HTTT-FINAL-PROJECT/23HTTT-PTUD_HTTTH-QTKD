using System.Globalization;
using System.Text.Json.Nodes;
using QTKD.Application.Common.Interfaces;
using QTKD.Domain.Contracts;

namespace QTKD.Application.Features.Contracts;

public partial class ContractService
{
    private readonly IContractManagementRepository _management;
    private readonly IContractRepository _contracts;
    private readonly IContractFileStorage? _files;

    public ContractService(IContractManagementRepository management, IContractRepository contracts, IContractFileStorage? files = null)
    {
        _management = management;
        _contracts = contracts;
        _files = files;
    }

    /// <summary>SYS-CTR-04 bước 3–5: kiểm tra hồ sơ trước khi hiển thị hộp thoại xác nhận.</summary>
    public async Task<JsonObject> SubmitCheck(Actor actor, string code, CancellationToken ct)
    {
        var current = await Find(actor, code, ct);
        var reviewer = await CheckSubmit(actor, current, false, ct);

        return new JsonObject
        {
            ["salesReviewer"] = reviewer.Name,
            ["resubmit"] = current.Status == "RevisionRequested"
        };
    }

    /// <summary>SYS-CTR-04 bước 6–9: tạo lượt duyệt và giao bước đầu cho Trưởng phòng KD.</summary>
    public async Task<JsonObject> Submit(Actor actor, string code, string key, CancellationToken ct)
    {
        var result = await _contracts.IdempotentAsync(actor, $"contracts:{code}:submit", Key(key), new { code }, () => SubmitIn(actor, code, ct), ct);

        // A replayed response is only returned while the contract is still in the actor's scope.
        if (result["replayed"]?.GetValue<bool>() == true && result["contract"]?["code"] is JsonValue replayed)
        {
            await Find(actor, replayed.GetValue<string>(), ct);
        }

        return result;
    }

    private async Task<JsonObject> SubmitIn(Actor actor, string code, CancellationToken ct)
    {
        ContractRecord current;
        SalesReviewer reviewer;
        // The status only changes if nobody changed the contract since it was read; otherwise read and check again.
        do
        {
            current = await Find(actor, code, ct);
            reviewer = await CheckSubmit(actor, current, true, ct);
        }
        while (!await _contracts.TryMarkSubmittedAsync(current.Id, current.Status, current.Version, ct));

        // This transaction now holds the contract row, so a cancellation request created meanwhile is visible.
        await NoPendingCancellation(current.Id, ct);

        var no = await _contracts.StartRoundAsync(current.Id, actor.Id, reviewer.Id, ct);
        await _contracts.NotifyAsync(reviewer.Id, current.Id, $"Hồ sơ {code} – {current.Title} cần Rà soát kinh doanh.", ct);

        var before = Detail(current, actor);
        var next = Detail(await Find(actor, code, ct), actor);
        var audited = next.DeepClone().AsObject();
        audited["auditActor"] = new JsonObject
        {
            ["id"] = actor.Id.ToString(),
            ["name"] = actor.Name,
            ["role"] = actor.Role,
            ["departmentId"] = actor.DepartmentId.ToString()
        };
        await _contracts.AuditAsync(current.Id, "CONTRACT_SUBMITTED", actor.Id, current.Status, "Submitted", before, audited,
            current.Status == "RevisionRequested" ? $"Trình lại, lượt {no}" : $"Lượt {no}", ct);

        return new JsonObject
        {
            ["contract"] = next,
            ["replayed"] = false
        };
    }

    /// <summary>Bước 3–4 và E1–E5; trả về Trưởng phòng KD quản lý phòng sở hữu hồ sơ.</summary>
    private async Task<SalesReviewer> CheckSubmit(Actor actor, ContractRecord current, bool submitting, CancellationToken ct)
    {
        ContractRules.RequireOwner(actor, current.OwnerId);
        ContractRules.RequireEditable(current.Status);
        if (submitting)
        {
            await NoPendingCancellation(current.Id, ct);
        }

        var missing = new List<string>();
        if (current.Items.Count == 0)
        {
            missing.Add("Ít nhất một hạng mục dịch vụ");
        }

        missing.AddRange(current.Items
            .Where(s => s.RequiresArea && string.IsNullOrEmpty(s.AreaCode))
            .Select(s => $"Khu vực thực hiện của \"{s.ServiceName}\""));

        if (current.Attachments.Count == 0)
        {
            missing.Add("Tệp hợp đồng hoặc tài liệu đính kèm (ít nhất 1 tệp)");
        }

        if (missing.Count > 0)
        {
            throw new BusinessException("MISSING", 409, new { items = missing });
        }

        var suspended = await _contracts.InactiveAreaItemsAsync(current.Id, ct);
        if (suspended.Count > 0)
        {
            throw new BusinessException("AREA_INACTIVE", 409, new { items = suspended });
        }

        return await _contracts.FindSalesReviewerAsync(current.Id, ct) ?? throw new BusinessException("NO_APPROVER", 409);
    }

    private async Task NoPendingCancellation(Guid id, CancellationToken ct)
    {
        if (await _contracts.HasPendingCancellationAsync(id, ct))
        {
            throw new BusinessException("CANCELLATION_PENDING");
        }
    }

    private async Task<ContractRecord> Find(Actor actor, string code, CancellationToken ct) =>
        await _contracts.FindAsync(actor, code, ct) ?? throw new BusinessException("NOT_FOUND", 404);

    // ContractRecord → the contract detail response (same shape as GET /contracts/{code}).
    private static JsonObject Detail(ContractRecord c, Actor actor)
    {
        var data = new JsonObject
        {
            ["id"] = c.Id.ToString(),
            ["code"] = c.Code,
            ["title"] = c.Title,
            ["contractType"] = c.ContractType,
            ["customerCode"] = c.CustomerCode,
            ["customerName"] = c.CustomerName,
            ["sourceMode"] = c.SourceMode,
            ["templateCode"] = c.TemplateCode ?? "",
            ["effectiveFrom"] = c.StartDate.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
            ["effectiveTo"] = c.EndDate.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
            ["value"] = c.Value,
            ["paymentTerm"] = c.PaymentTerms,
            ["content"] = c.Content,
            ["status"] = ContractRules.ToClientStatus(c.Status),
            ["ownerId"] = c.OwnerId.ToString(),
            ["ownerName"] = c.OwnerName,
            ["departmentCode"] = c.OwningDepartmentId?.ToString() ?? "",
            ["createdAt"] = Time(c.CreatedAt),
            ["updatedAt"] = Time(c.UpdatedAt),
            ["version"] = c.Version,
            ["customerSnapshot"] = JsonNode.Parse(c.CustomerSnapshot),
            ["services"] = Array(c.Items.Select(i => new JsonObject
            {
                ["id"] = i.Id.ToString(),
                ["serviceCode"] = i.ServiceCode,
                ["serviceName"] = i.ServiceName,
                ["unit"] = i.Unit,
                ["requiresArea"] = i.RequiresArea,
                ["areaCode"] = i.AreaCode ?? "",
                ["areaActive"] = i.AreaActive
            })),
            ["attachments"] = Array(c.Attachments.Select(f => new JsonObject
            {
                ["id"] = f.Id.ToString(),
                ["name"] = f.Name,
                ["size"] = f.Size,
                ["downloadUrl"] = $"/api/v1/contracts/{c.Code}/attachments/{f.Id}"
            })),
            ["rounds"] = Array(c.Rounds.Select(r => Round(r, actor))),
            ["cancellationRequests"] = Array(c.CancellationRequests.Select(r => new JsonObject
            {
                ["id"] = r.Id.ToString(),
                ["party"] = r.Party,
                ["reason"] = r.Reason,
                ["status"] = r.Status,
                ["requestedByName"] = r.RequestedByName,
                ["requestedAt"] = Time(r.RequestedAt),
                ["version"] = r.Version,
                ["salesAssigneeId"] = r.SalesAssigneeId.ToString(),
                ["salesAssigneeName"] = r.SalesAssigneeName,
                ["salesApproved"] = r.SalesApproved,
                ["salesReason"] = r.SalesReason,
                ["salesDecidedAt"] = Time(r.SalesDecidedAt),
                ["boardAssigneeId"] = r.BoardAssigneeId?.ToString(),
                ["boardAssigneeName"] = r.BoardAssigneeName,
                ["boardApproved"] = r.BoardApproved,
                ["boardReason"] = r.BoardReason,
                ["boardDecidedAt"] = Time(r.BoardDecidedAt),
                ["notificationStatus"] = r.NotificationStatus
            }))
        };

        if (c.Cancellation is { } cancellation)
        {
            data["cancellation"] = new JsonObject
            {
                ["byName"] = cancellation.ByName,
                ["at"] = Time(cancellation.At),
                ["reason"] = cancellation.Reason
            };
        }

        if (c.Status is "RevisionRequested" or "Rejected")
        {
            data[c.Status == "Rejected" ? "rejection" : "revisionRequest"] = c.LastDecision is { } d
                ? new JsonObject
                {
                    ["stepLabel"] = d.StepLabel,
                    ["byName"] = d.ByName,
                    ["at"] = Time(d.At),
                    ["content"] = d.Comment,
                    ["reason"] = d.Comment
                }
                : null;
        }

        data["history"] = Array(c.History.Select(h => new JsonObject
        {
            ["at"] = Time(h.At),
            ["action"] = h.Action,
            // The audit row keeps the actor's name at the time; the live account name is only a fallback.
            ["byName"] = AuditActorName(h.ValueAfter) ?? h.ActorName,
            ["note"] = h.Note,
            ["from"] = h.From,
            ["to"] = h.To
        }));

        return data;
    }

    private static JsonObject Round(ApprovalRoundRecord r, Actor actor)
    {
        var snapshot = JsonNode.Parse(r.Snapshot);
        var stages = snapshot?["workflow"]?["stages"] as JsonArray;
        return new JsonObject
        {
            ["id"] = r.Id.ToString(),
            ["no"] = r.No,
            ["submittedById"] = r.SubmittedById.ToString(),
            ["submittedByName"] = r.SubmittedByName,
            ["submittedAt"] = Time(r.SubmittedAt),
            ["contractVersion"] = r.RecordVersion,
            ["configCode"] = Text(snapshot?["configCode"]) ?? "",
            ["configVersion"] = 1,
            ["endedAt"] = Time(r.EndedAt),
            ["result"] = r.Result switch
            {
                "Running" => "in-progress",
                "RevisionRequested" => "revision",
                _ => r.Result.ToLowerInvariant()
            },
            ["log"] = new JsonArray(),
            ["coordinations"] = new JsonArray(),
            ["steps"] = Array(r.Steps.Select(s =>
            {
                // Stage of the step in the submitted workflow; rounds without one fall back to the assignee's role.
                var stage = s.Order >= 1 && stages is not null && s.Order <= stages.Count ? stages[s.Order - 1] : null;
                var stageKey = (stage is JsonObject o ? Text(o["key"]) : null) ?? Text(stage) ?? s.AssigneeRole;
                var legal = stageKey is "LegalStaff" or "legal";
                return new JsonObject
                {
                    ["id"] = s.Id.ToString(),
                    ["key"] = stageKey switch
                    {
                        "SalesManager" or "sales" => "sales",
                        "LegalStaff" or "legal" => "legal",
                        _ => "board"
                    },
                    ["label"] = s.Label,
                    ["assigneeId"] = s.AssigneeId?.ToString(),
                    ["assigneeName"] = s.AssigneeName,
                    ["assignedAt"] = Time(s.AssignedAt),
                    ["acceptedAt"] = Time(s.AcceptedAt),
                    ["state"] = s.Status switch
                    {
                        "NotStarted" => s.AssigneeId is null ? "unassigned" : "waiting",
                        "Pending" => "pending-accept",
                        "Reviewing" => "reviewing",
                        "Completed" => s.Decision == "Approve" ? "done" : "stopped",
                        _ => "skipped"
                    },
                    ["decision"] = s.Decision switch
                    {
                        "Approve" => "approve",
                        "RequestRevision" => "revision",
                        "Reject" => "reject",
                        _ => null
                    },
                    ["decidedByName"] = s.DecidedByName,
                    ["decidedAt"] = Time(s.DecidedAt),
                    ["reviewedVersion"] = s.Decision is null ? null : r.RecordVersion,
                    // Legal comments are only shown to the legal department.
                    ["comment"] = legal && actor.Role is not ("LegalStaff" or "LegalManager") ? null : s.Comment
                };
            }))
        };
    }

    private static JsonArray Array(IEnumerable<JsonNode> nodes) => new(nodes.ToArray());

    /// <summary>Text of a JSON value: a string as is, any other value as JSON; null when absent or JSON null.</summary>
    private static string? Text(JsonNode? node) => node switch
    {
        null => null,
        JsonValue v when v.TryGetValue<string>(out var s) => s,
        _ => node.ToJsonString()
    };

    private static string? AuditActorName(string? valueAfter) =>
        valueAfter is null ? null : Text(JsonNode.Parse(valueAfter)?["auditActor"]?["name"]);

    /// <summary>Timestamps in the format PostgreSQL uses for timestamptz in JSON (UTC).</summary>
    private static JsonNode? Time(DateTime? value) =>
        value is DateTime t
            ? new DateTimeOffset(DateTime.SpecifyKind(t, DateTimeKind.Utc)).ToString("yyyy-MM-dd'T'HH:mm:ss.FFFFFFzzz", CultureInfo.InvariantCulture)
            : null;

    public static string Key(string? key)
    {
        if (string.IsNullOrWhiteSpace(key) || key.Length > 128)
        {
            throw new BusinessException("IDEMPOTENCY_KEY_REQUIRED", 400);
        }

        return key;
    }
}
