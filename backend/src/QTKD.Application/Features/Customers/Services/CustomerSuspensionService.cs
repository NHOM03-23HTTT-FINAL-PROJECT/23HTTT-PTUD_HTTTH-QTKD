using System.Text.Json;
using QTKD.Application.Common.Interfaces;
using QTKD.Domain.Customers;
using static QTKD.Application.Features.Customers.CustomerValidator;

namespace QTKD.Application.Features.Customers;

public sealed partial class CustomerService
{
    public static readonly SuspensionReasonGroup[] SuspensionReasons =
    [
        new("CONG_NO", "Công nợ quá hạn"), new("VI_PHAM_HD", "Vi phạm điều khoản hợp đồng"),
        new("TRANH_CHAP", "Tranh chấp đang giải quyết"), new("VAN_HANH", "Vấn đề vận hành, an toàn"),
        new("DE_NGHI_KH", "Theo đề nghị của khách hàng"), new("KHAC", "Lý do khác")
    ];

    private static string ReviewToken(CustomerRecord row, SuspensionSourceResult source) =>
        Hash(new { row.Id, row.Version, source.Complete, source.Fingerprint, source.Items, source.FailedKinds,
            source.MissingSources, source.NotificationDepartments });

    public async Task<SuspensionReview> GetSuspensionReview(Guid actorId, string code, CancellationToken ct)
    {
        var actor = await Actor(actorId, ct);
        await using var tx = await repository.Begin(ct, repeatableRead: true);
        var row = await Find(actor, code, ct);
        await RequireStatusPermission(actor, row, ct, "suspend");
        if (row.Status != "Active") throw new CustomerFailure(409, "ALREADY_IN_STATUS");
        var source = await statusSource.Suspension(row.Id, actor.Id, false, ct);
        var result = new SuspensionReview(source.Items, source.FailedKinds, source.MissingSources,
            ReviewToken(row, source), source.NotificationDepartments, source.Complete ? null : await repository.Now(ct));
        await tx.Commit(ct);
        return result;
    }

    public async Task<StatusChangeResult> Suspend(Guid actorId, Guid sessionId, string code, string key,
        SuspendCustomerRequest request, CancellationToken ct)
    {
        Key(key); var customerCode = Code(code); var hash = Hash(new { customerCode, request });
        var reason = RequiredReason(request.Reason);
        var note = (request.CoordinationNote ?? "").Trim();
        if (!SuspensionReasons.Any(g => g.Code == request.ReasonGroup) || note.Length > 5000 || request.BaseVersion < 1
            || request.Plan is null || request.Plan.Length > 1000 || request.Plan.Any(p => p is null
                || string.IsNullOrWhiteSpace(p.Id) || p.Id.Length > 200 || string.IsNullOrWhiteSpace(p.Option) || p.Option.Length > 1000)
            || string.IsNullOrWhiteSpace(request.ReviewToken) || request.ReviewToken.Length > 128)
            throw new CustomerFailure(400, "VALIDATION");
        if (request.Evidence is { Length: > 0 }) throw new CustomerFailure(400, "EVIDENCE_UNAVAILABLE");

        await using var tx = await repository.Begin(ct);
        var actor = await Authorize(actorId, sessionId, "customers.view", ct);
        await repository.LockRequest(actorId, "suspend", key, ct);
        var row = await Find(actor, customerCode, ct, locked: true);
        await RequireStatusPermission(actor, row, ct, "suspend");
        var replay = await Replay<StatusChangeResult>(actorId, "suspend", key, hash, row.Id, ct);
        if (replay is not null) { await tx.Commit(ct); return replay with { Replayed = true }; }
        if (row.Status != "Active") throw new CustomerFailure(409, "ALREADY_IN_STATUS");
        if (row.Version != request.BaseVersion) throw new CustomerFailure(409, "CONFLICT");

        // The authoritative provider protects the records until this transaction ends.
        // A complete, empty review is valid; unavailable sources are not empty reviews.
        var source = await statusSource.Suspension(row.Id, actor.Id, true, ct);
        if (!source.Complete || source.MissingSources.Length > 0 || source.FailedKinds.Length > 0)
            throw new CustomerFailure(503, "REVIEW_INCOMPLETE", new { sources = source.MissingSources });
        if (request.ReviewToken != ReviewToken(row, source)) throw new CustomerFailure(409, "REVIEW_CHANGED");
        if (request.Plan.Length != source.Items.Length || request.Plan.Select(p => p.Id).Distinct().Count() != request.Plan.Length)
            throw new CustomerFailure(409, "PLAN_INCOMPLETE");
        var plan = source.Items.Select(item =>
        {
            var choice = request.Plan.SingleOrDefault(p => p.Id == item.Id)?.Option;
            if (choice is null || !item.Options.Contains(choice)) throw new CustomerFailure(409, "PLAN_INCOMPLETE");
            return new SuspensionPlanItem(item.Id, item.Kind, item.Code, item.Department, item.PlanNote, choice);
        }).ToArray();
        if (plan.Length > 0 && note.Length == 0) throw new CustomerFailure(409, "PLAN_INCOMPLETE");

        await RequireStatusPermission(actor, row, ct, "suspend");
        if (!await repository.SessionValid(actorId, sessionId, ct)) throw new CustomerFailure(401, "SESSION_ENDED");
        await repository.SetStatus(row.Id, "Suspended", ct);
        var followUp = plan.Length == 0 ? null : string.Join("\n", plan.Select(p => $"{p.Code}: {p.Option}"));
        var decision = await repository.AddDecision(row.Id, actor.Id, "suspend", reason, note.Length == 0 ? null : note,
            followUp, JsonSerializer.Serialize(new { request.ReasonGroup, plan, coordinationNote = note,
                reviewToken = request.ReviewToken, source.Fingerprint }, Json), ct);
        var updated = await Find(actor, row.Id, ct);
        await repository.Audit(actor.Id, row.Id, "Customer", "CUSTOMER_SUSPENDED", JsonSerializer.Serialize(new
        {
            decisionId = decision, action = "Tạm ngưng khách hàng", by = actor.Name, at = await repository.Now(ct),
            before = Status(row.Status), after = Status(updated.Status), fromVersion = row.Version,
            version = updated.Version, reason, plan, coordinationNote = note
        }, Json), reason, ct);
        // No applicable notification configuration means no outbox request (SYS-CUS-03 A9).
        if (source.NotificationDepartments.Length > 0)
            await repository.AddOutbox(decision, JsonSerializer.Serialize(new { customerCode = row.Code, type = "Suspend",
                reason, plan, coordinationNote = note, departments = source.NotificationDepartments }, Json), ct);
        var result = new StatusChangeResult(await View(updated, ct), false);
        await Receipt(actorId, "suspend", key, hash, row.Id, result, ct);
        await tx.Commit(ct);
        return result;
    }
}
