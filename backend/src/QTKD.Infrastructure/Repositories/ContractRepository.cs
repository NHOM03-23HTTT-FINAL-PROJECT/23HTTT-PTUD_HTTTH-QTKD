using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using QTKD.Application.Common.Interfaces;
using QTKD.Domain.Contracts;
using QTKD.Domain.Notifications;
using QTKD.Infrastructure.Persistence;
using QTKD.Infrastructure.Persistence.Schema;
using UserRole = QTKD.Domain.Identity.UserRole;
using UserStatus = QTKD.Domain.Identity.UserStatus;
using Area = QTKD.Domain.Entities.Area;
using Service = QTKD.Domain.Entities.Service;
using AreaStatus = QTKD.Domain.Enums.ActiveStatus;

namespace QTKD.Infrastructure.Repositories;

/// <summary>
/// SYS-CTR-04 through EF Core LINQ on QtkdDbContext. Every read is filtered by the contract or by the actor's scope.
/// Writes join the transaction opened by IdempotentAsync.
/// </summary>
public partial class ContractRepository(QtkdDbContext db, IHttpContextAccessor? http = null) : IContractRepository, IContractManagementRepository
{
    private static readonly JsonSerializerOptions Web = new(JsonSerializerDefaults.Web);

    private IQueryable<UserAccount> Users => db.Set<UserAccount>().AsNoTracking();
    private IQueryable<ApprovalRound> Rounds => db.Set<ApprovalRound>().AsNoTracking();
    private IQueryable<ApprovalStep> Steps => db.Set<ApprovalStep>().AsNoTracking();
    private IQueryable<ContractItem> Items => db.Set<ContractItem>().AsNoTracking();
    private IQueryable<Area> Areas => db.Set<Area>().AsNoTracking();
    private IQueryable<Service> Services => db.Set<Service>().AsNoTracking();
    private IQueryable<ContractCancellationRequest> CancellationRequests => db.Set<ContractCancellationRequest>().AsNoTracking();

    public async Task<JsonObject> IdempotentAsync(Actor actor, string operation, string key, object payload, Func<Task<JsonObject>> action, CancellationToken ct)
    {
        var fingerprint = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(JsonSerializer.Serialize(payload, Web))));
        while (true)
        {
            await using var tx = await db.Database.BeginTransactionAsync(ct);
            var stored = await db.Set<IdempotencyRequest>().AsNoTracking()
                .SingleOrDefaultAsync(r => r.ActorId == actor.Id && r.Operation == operation && r.Key == key, ct);
            if (stored is not null)
            {
                if (stored.Fingerprint != fingerprint)
                {
                    throw new BusinessException("IDEMPOTENCY_CONFLICT");
                }

                var response = JsonNode.Parse(stored.Response)!.AsObject();
                response["replayed"] = true;
                await tx.CommitAsync(ct);
                return response;
            }

            // The key row is written first: a concurrent request with the same key waits on it until this one ends,
            // then reads the stored response on its next pass.
            var request = new IdempotencyRequest { ActorId = actor.Id, Operation = operation, Key = key, Fingerprint = fingerprint, Response = "{}" };
            db.Add(request);
            try
            {
                await db.SaveChangesAsync(ct);
            }
            catch (DbUpdateException e) when (e.InnerException is PostgresException { SqlState: PostgresErrorCodes.UniqueViolation })
            {
                await tx.RollbackAsync(ct);
                db.ChangeTracker.Clear();
                continue;
            }

            var result = await action();
            request.Response = result.ToJsonString();
            await db.SaveChangesAsync(ct);
            await tx.CommitAsync(ct);
            return result;
        }
    }

    public async Task<ContractRecord?> FindAsync(Actor actor, string code, CancellationToken ct)
    {
        var row = await (
            from k in Scoped(actor).Where(k => k.ContractCode == code)
            from cu in db.Set<Customer>().AsNoTracking().Where(cu => cu.CustomerId == k.CustomerId)
            from o in Users.Where(o => o.UserId == k.OwnerId)
            select new { Contract = k, cu.CustomerCode, cu.CustomerName, OwnerName = o.FullName })
            .FirstOrDefaultAsync(ct);
        if (row is null)
        {
            return null;
        }

        var c = row.Contract;
        var id = c.ContractId;

        var items = await (
            from ci in Items.Where(ci => ci.ContractId == id)
            from s in Services.Where(s => s.ServiceId == ci.ServiceId)
            from a in Areas.Where(a => a.AreaId == ci.AreaId).DefaultIfEmpty()
            orderby ci.ItemId
            select new ContractItemRecord(ci.ItemId, s.ServiceCode, s.ServiceName, s.Unit, s.RequiresArea,
                a == null ? null : a.AreaCode, a == null ? null : (bool?)(a.Status == AreaStatus.Active)))
            .ToListAsync(ct);

        var attachments = await db.Set<Attachment>().AsNoTracking()
            .Where(f => f.ContractId == id)
            .OrderBy(f => f.UploadedAt)
            .Select(f => new ContractAttachmentRecord(f.AttachmentId, f.FileName, f.FileSize))
            .ToListAsync(ct);

        var cancellation = c.CancelledAt is DateTime cancelledAt
            ? new ContractCancellationRecord(
                await Users.Where(u => u.UserId == c.CancelledBy).Select(u => u.FullName).FirstOrDefaultAsync(ct),
                cancelledAt,
                c.CancellationReason)
            : null;

        var lastDecision = c.Status is ContractStatus.RevisionRequested or ContractStatus.Rejected
            ? await (
                from r in Rounds.Where(r => r.ContractId == id)
                from s in Steps.Where(s => s.RoundId == r.RoundId &&
                    (s.Decision == ApprovalDecision.RequestRevision || s.Decision == ApprovalDecision.Reject))
                from u in Users.Where(u => u.UserId == s.DecidedBy)
                orderby s.DecidedAt descending
                select new ApprovalDecisionRecord(s.StepName, u.FullName, s.DecidedAt, s.Comment))
                .FirstOrDefaultAsync(ct)
            : null;

        var history = await (
            from a in db.Set<AuditLog>().AsNoTracking().Where(a => a.EntityType == "Contract" && a.EntityId == id)
            from u in Users.Where(u => u.UserId == a.ActorId).DefaultIfEmpty()
            orderby a.ActedAt
            select new ContractHistoryRecord(a.ActedAt, a.Action, u == null ? null : u.FullName, a.ValueAfter, a.Note, a.StatusBefore, a.StatusAfter))
            .ToListAsync(ct);

        return new ContractRecord(
            id, c.ContractCode, c.Title, c.ContractType, c.SourceMode, c.TemplateCode,
            c.StartDate, c.EndDate, c.ContractValue, c.PaymentTerms, c.Content, c.Status.ToString(),
            c.OwnerId, row.OwnerName, c.OwningDepartmentId, row.CustomerCode, row.CustomerName, c.CustomerSnapshot,
            c.Version, c.CreatedAt, c.UpdatedAt,
            items, attachments, await RoundsOf(id, ct), await CancellationRequestsOf(id, ct), cancellation, lastDecision, history);
    }

    public Task<bool> HasPendingCancellationAsync(Guid contractId, CancellationToken ct) =>
        CancellationRequests.AnyAsync(r => r.ContractId == contractId && (r.Status == "pending-sales" || r.Status == "pending-board"), ct);

    public async Task<IReadOnlyList<string>> InactiveAreaItemsAsync(Guid contractId, CancellationToken ct)
    {
        var items = await (
            from ci in Items.Where(ci => ci.ContractId == contractId)
            from s in Services.Where(s => s.ServiceId == ci.ServiceId)
            from a in Areas.Where(a => a.AreaId == ci.AreaId)
            orderby ci.ItemId
            select new { Label = s.ServiceName + " · " + a.AreaCode, a.AreaId })
            .ToListAsync(ct);

        // Load each item's area and all of its ancestors, one level per query.
        var areas = new Dictionary<Guid, (Guid? Parent, AreaStatus Status)>();
        var next = items.Select(i => i.AreaId).Distinct().ToList();
        while (next.Count > 0)
        {
            var level = await Areas.Where(a => next.Contains(a.AreaId))
                .Select(a => new { a.AreaId, a.ParentAreaId, a.Status })
                .ToListAsync(ct);
            foreach (var a in level)
            {
                areas[a.AreaId] = (a.ParentAreaId, a.Status);
            }

            next = level.Where(a => a.ParentAreaId is Guid p && !areas.ContainsKey(p))
                .Select(a => a.ParentAreaId!.Value).Distinct().ToList();
        }

        // An area is unusable when it or any ancestor is no longer Active.
        bool Unusable(Guid areaId)
        {
            var seen = new HashSet<Guid>();
            for (Guid? current = areaId; current is Guid id && seen.Add(id) && areas.TryGetValue(id, out var area); current = area.Parent)
            {
                if (area.Status != AreaStatus.Active)
                {
                    return true;
                }
            }

            return false;
        }

        return items.Where(i => Unusable(i.AreaId)).Select(i => i.Label).ToList();
    }

    public Task<SalesReviewer?> FindSalesReviewerAsync(Guid contractId, CancellationToken ct) =>
        (from c in db.Contracts.AsNoTracking().Where(c => c.ContractId == contractId)
         from o in Users.Where(o => o.UserId == c.OwnerId)
         from d in db.Set<Department>().AsNoTracking().Where(d => d.DepartmentId == (c.OwningDepartmentId ?? o.DepartmentId))
         from m in Users.Where(m => m.UserId == d.ManagerId)
         from p in db.Set<RolePermission>().AsNoTracking().Where(p => p.Role == m.Role && p.PermissionCode == "approvals.approve")
         where m.Role == UserRole.SalesManager && m.Status == UserStatus.Active && !m.MustChangePassword && m.UserId != c.OwnerId
         select new SalesReviewer(m.UserId, m.FullName))
        .FirstOrDefaultAsync(ct);

    public async Task<bool> TryMarkSubmittedAsync(Guid contractId, string status, int version, CancellationToken ct)
    {
        var from = Enum.Parse<ContractStatus>(status);
        return await db.Contracts
            .Where(c => c.ContractId == contractId && c.Status == from && c.Version == version)
            .ExecuteUpdateAsync(s => s.SetProperty(c => c.Status, ContractStatus.Submitted), ct) == 1;
    }

    public async Task<int> StartRoundAsync(Guid contractId, Guid submittedBy, Guid reviewerId, CancellationToken ct)
    {
        var contract = await db.Contracts.AsNoTracking().SingleAsync(c => c.ContractId == contractId, ct);
        var items = await Items.Where(i => i.ContractId == contractId).OrderBy(i => i.ItemId).ToListAsync(ct);
        var no = (await Rounds.Where(r => r.ContractId == contractId).MaxAsync(r => (int?)r.RoundNo, ct) ?? 0) + 1;

        // The snapshot pins the submitted content; the approval module reads workflow.stages from it.
        var snapshot = new JsonObject
        {
            ["contractId"] = contract.ContractId.ToString(),
            ["code"] = contract.ContractCode,
            ["title"] = contract.Title,
            ["customer"] = JsonNode.Parse(contract.CustomerSnapshot),
            ["contractValue"] = contract.ContractValue,
            ["version"] = contract.Version,
            ["items"] = new JsonArray(items.Select(i => (JsonNode)new JsonObject
            {
                ["item_id"] = i.ItemId.ToString(),
                ["contract_id"] = i.ContractId.ToString(),
                ["service_id"] = i.ServiceId.ToString(),
                ["area_id"] = i.AreaId?.ToString(),
                ["area_name_snapshot"] = i.AreaNameSnapshot
            }).ToArray()),
            ["workflow"] = new JsonObject
            {
                ["version"] = 1,
                ["stages"] = new JsonArray("SalesManager", "LegalStaff", "BoardMember")
            }
        };

        var roundId = Guid.NewGuid();
        db.Add(new ApprovalRound
        {
            RoundId = roundId,
            RecordType = DocumentRecordType.Contract,
            ContractId = contractId,
            RecordVersion = contract.Version,
            RoundNo = no,
            SubmittedBy = submittedBy,
            RecordSnapshot = snapshot.ToJsonString()
        });

        // The approval module requires all three steps; legal and board wait for assignment.
        db.AddRange(
            new ApprovalStep { RoundId = roundId, StepName = "Rà soát kinh doanh", StepOrder = 1, AssigneeId = reviewerId, AssignedAt = DateTime.UtcNow, StepStatus = ApprovalStepStatus.Pending },
            new ApprovalStep { RoundId = roundId, StepName = "Rà soát pháp lý", StepOrder = 2, StepStatus = ApprovalStepStatus.NotStarted },
            new ApprovalStep { RoundId = roundId, StepName = "Phê duyệt", StepOrder = 3, StepStatus = ApprovalStepStatus.NotStarted });
        await db.SaveChangesAsync(ct);
        return no;
    }

    public async Task NotifyAsync(Guid recipientId, Guid contractId, string content, CancellationToken ct)
    {
        db.Notifications.Add(new Notification { RecipientId = recipientId, RecordType = RecordType.Contract, RecordId = contractId, Content = content });
        await db.SaveChangesAsync(ct);
    }

    public async Task AuditAsync(Guid contractId, string action, Guid actorId, string? beforeStatus, string afterStatus,
        JsonObject? before, JsonObject after, string? note, CancellationToken ct)
    {
        db.Add(new AuditLog
        {
            EntityType = "Contract",
            EntityId = contractId,
            Action = action,
            ActorId = actorId,
            StatusBefore = beforeStatus,
            StatusAfter = afterStatus,
            ValueBefore = before?.ToJsonString(),
            ValueAfter = after.ToJsonString(),
            Note = note,
            IpAddress = http?.HttpContext?.Connection.RemoteIpAddress?.ToString()
        });
        await db.SaveChangesAsync(ct);
    }

    // All scope checks happen before any other filter. A role alone never grants board/legal access.
    private IQueryable<Contract> Scoped(Actor actor)
    {
        var contracts = db.Contracts.AsNoTracking().Where(c => c.DocumentType == ContractDocumentType.Contract);
        var me = actor.Id;
        return actor.Role switch
        {
            "SalesStaff" => contracts.Where(c => c.OwnerId == me),
            "SalesManager" when actor.ManagedDepartmentId is Guid department => contracts.Where(c => c.OwningDepartmentId == department),
            "LegalStaff" or "LegalManager" or "BoardMember" or "BoardChair" => contracts.Where(c =>
                db.Set<ApprovalRound>().Any(r => r.ContractId == c.ContractId &&
                    db.Set<ApprovalStep>().Any(s => s.RoundId == r.RoundId && s.AssigneeId == me)) ||
                db.Set<ContractCancellationRequest>().Any(r => r.ContractId == c.ContractId && (r.SalesAssigneeId == me || r.BoardAssigneeId == me))),
            _ => contracts.Where(c => false)
        };
    }

    private async Task<IReadOnlyList<ApprovalRoundRecord>> RoundsOf(Guid contractId, CancellationToken ct)
    {
        var rounds = await (
            from r in Rounds.Where(r => r.ContractId == contractId)
            from u in Users.Where(u => u.UserId == r.SubmittedBy)
            orderby r.RoundNo
            select new { Round = r, SubmittedByName = u.FullName })
            .ToListAsync(ct);
        var ids = rounds.Select(r => r.Round.RoundId).ToList();

        var steps = await (
            from s in Steps.Where(s => ids.Contains(s.RoundId))
            from au in Users.Where(u => u.UserId == s.AssigneeId).DefaultIfEmpty()
            from du in Users.Where(u => u.UserId == s.DecidedBy).DefaultIfEmpty()
            orderby s.StepOrder
            select new
            {
                Step = s,
                AssigneeName = au == null ? null : au.FullName,
                AssigneeRole = au == null ? (UserRole?)null : au.Role,
                DecidedByName = du == null ? null : du.FullName
            })
            .ToListAsync(ct);

        var log = await ApprovalLogOf(contractId, steps.ToDictionary(s => s.Step.StepId, s => s.Step.RoundId), ct);

        return rounds.Select(x => new ApprovalRoundRecord(
            x.Round.RoundId, x.Round.RoundNo, x.Round.SubmittedBy, x.SubmittedByName, x.Round.SubmittedAt, x.Round.RecordVersion,
            x.Round.RecordSnapshot, x.Round.EndedAt, x.Round.Result.ToString(),
            steps.Where(s => s.Step.RoundId == x.Round.RoundId).Select(s => new ApprovalStepRecord(
                s.Step.StepId, s.Step.StepOrder, s.Step.StepName, s.Step.AssigneeId, s.AssigneeName, s.AssigneeRole?.ToString(),
                s.Step.AssignedAt, s.Step.AcceptedAt, s.Step.StepStatus.ToString(), s.Step.Decision?.ToString(),
                s.DecidedByName, s.Step.DecidedAt, s.Step.Comment)).ToList(),
            log.Where(l => l.RoundId == x.Round.RoundId).Select(l => l.Entry).ToList())).ToList();
    }

    /// <summary>Approval decisions and assignments of the contract, each matched to its round through the step it acted on.</summary>
    private async Task<List<(Guid RoundId, ApprovalLogRecord Entry)>> ApprovalLogOf(Guid contractId, Dictionary<Guid, Guid> roundOfStep, CancellationToken ct)
    {
        var rows = await (
            from a in db.Set<AuditLog>().AsNoTracking()
                .Where(a => a.EntityId == contractId && (a.EntityType == "ContractApproval" || a.EntityType == "ContractApprovalAssignment"))
            from u in Users.Where(u => u.UserId == a.ActorId).DefaultIfEmpty()
            orderby a.ActedAt
            select new { a.ActedAt, a.EntityType, a.Action, ActorName = u == null ? null : u.FullName, a.StatusBefore, a.StatusAfter, a.ValueAfter, a.Note })
            .ToListAsync(ct);

        var parsed = rows.Select(r =>
        {
            var value = r.ValueAfter is null ? null : JsonNode.Parse(r.ValueAfter);
            return (Row: r, StepId: Id(value?["stepId"]), RoundId: Id(value?["roundId"]), AssigneeId: Id(value?["assigneeId"]));
        }).ToList();

        var assigneeIds = parsed.Where(p => p.AssigneeId is not null).Select(p => p.AssigneeId!.Value).Distinct().ToList();
        var names = await Users.Where(u => assigneeIds.Contains(u.UserId)).ToDictionaryAsync(u => u.UserId, u => u.FullName, ct);

        var result = new List<(Guid, ApprovalLogRecord)>();
        foreach (var (r, stepId, roundId, assigneeId) in parsed)
        {
            if (stepId is not Guid step || !roundOfStep.TryGetValue(step, out var round) || (roundId is Guid id && id != round))
            {
                continue;
            }

            var assignment = r.EntityType == "ContractApprovalAssignment";
            var note = assignment
                ? assigneeId is Guid a && names.TryGetValue(a, out var name) ? $"Giao cho {name}" : null
                : r.Note;
            result.Add((round, new ApprovalLogRecord(r.ActedAt, step, r.Action, r.ActorName,
                assignment ? null : r.StatusBefore, assignment ? null : r.StatusAfter, note)));
        }

        return result;
    }

    private static Guid? Id(JsonNode? node) =>
        node is JsonValue v && v.TryGetValue<string>(out var s) && Guid.TryParse(s, out var id) ? id : null;

    private Task<List<CancellationRequestRecord>> CancellationRequestsOf(Guid contractId, CancellationToken ct) =>
        (from r in CancellationRequests.Where(r => r.ContractId == contractId)
         from u in Users.Where(u => u.UserId == r.RequestedBy)
         from s in Users.Where(u => u.UserId == r.SalesAssigneeId)
         from b in Users.Where(u => u.UserId == r.BoardAssigneeId).DefaultIfEmpty()
         orderby r.RequestedAt descending
         select new CancellationRequestRecord(
             r.RequestId, r.Party, r.Reason, r.Status, u.FullName, r.RequestedAt, r.Version,
             r.SalesAssigneeId, s.FullName, r.SalesApproved, r.SalesReason, r.SalesDecidedAt,
             r.BoardAssigneeId, b == null ? null : b.FullName, r.BoardApproved, r.BoardReason, r.BoardDecidedAt,
             db.Set<ContractDelivery>().Where(d => d.RequestId == r.RequestId).Select(d => d.Status).FirstOrDefault()))
        .ToListAsync(ct);
}
