using System.Text.Json;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Configuration;
using Npgsql;
using QTKD.Application.Common.Interfaces;
using QTKD.Application.Features.ContractApprovals;

namespace QTKD.Infrastructure.ContractApprovals;

/// <summary>Uses EF Core-owned tables; never creates/migrates a database at application startup.</summary>
public sealed class PostgresApprovalStore(IConfiguration configuration, INotificationDeliveryRepository deliveries, IHttpContextAccessor? http = null) : IApprovalStore
{
    private async Task<NpgsqlConnection> Open(CancellationToken ct)
    {
        var c = new NpgsqlConnection(configuration.GetConnectionString("Identity"));
        try { await c.OpenAsync(ct); return c; } catch { await c.DisposeAsync(); throw; }
    }
    public async Task<ReviewDocument?> Read(Guid id, CancellationToken ct)
    {
        await using var c = await Open(ct);
        return (await Load(c, null, id, ct))?.Document;
    }
    public async Task<IReadOnlyList<ReviewDocument>> Inbox(ReviewActor actor, string step, bool done, CancellationToken ct)
    {
        await using var c = await Open(ct);
        await using var cmd = Command(c, null, """
            SELECT DISTINCT r.contract_id FROM qtkd.approval_round r JOIN qtkd.approval_step s USING(round_id)
            WHERE r.record_type='Contract' AND s.assignee_id=@actor
              AND ((@done AND s.step_status='Completed') OR (NOT @done AND r.result='Running'))
            """, ("actor", actor.Id), ("done", done));
        var ids = new List<Guid>();
        await using (var reader = await cmd.ExecuteReaderAsync(ct)) while (await reader.ReadAsync(ct)) ids.Add(reader.GetGuid(0));
        var documents = new List<ReviewDocument>();
        foreach (var id in ids)
        {
            var value = await Load(c, null, id, ct);
            if (value is not null) documents.Add(value.Document);
        }
        return documents;
    }
    public async Task<T> Locked<T>(Guid id, Func<IApprovalTransaction, Task<T>> action, CancellationToken ct)
    {
        await using var c = await Open(ct);
        await using var tx = await c.BeginTransactionAsync(ct);
        await using (var lockCommand = Command(c, tx, "SELECT contract_id FROM qtkd.contract WHERE contract_id=@id FOR UPDATE", ("id", id)))
            if (await lockCommand.ExecuteScalarAsync(ct) is null) throw new ReviewFailure(404, "NOT_FOUND");
        await using (var roundLock = Command(c, tx, "SELECT round_id FROM qtkd.approval_round WHERE contract_id=@id ORDER BY round_no DESC LIMIT 1 FOR UPDATE", ("id", id)))
            await roundLock.ExecuteScalarAsync(ct);
        var stored = await Load(c, tx, id, ct) ?? throw new ReviewFailure(409, "STEP_NOT_READY");
        var result = await action(new PostgresApprovalTransaction(c, tx, stored.Document, stored.OwnerId,
            http?.HttpContext?.Connection.RemoteIpAddress?.ToString()));
        await tx.CommitAsync(ct);
        return result;
    }
    public async Task RetryNotifications(Guid id, CancellationToken ct)
    {
        // Same publication path as the worker, scoped to this authorized contract.
        while (await deliveries.PublishPendingAsync(100, id, ct) == 100) { }
    }
    internal static NpgsqlCommand Command(NpgsqlConnection c, NpgsqlTransaction? tx, string sql, params (string Name, object? Value)[] parameters)
    {
        var cmd = new NpgsqlCommand(sql, c, tx);
        foreach (var (name, value) in parameters) cmd.Parameters.AddWithValue(name, value ?? DBNull.Value);
        return cmd;
    }
    internal sealed record Loaded(ReviewDocument Document, Guid OwnerId);
    internal static async Task<Loaded?> Load(NpgsqlConnection c, NpgsqlTransaction? tx, Guid id, CancellationToken ct)
    {
        await using var cmd = Command(c, tx, """
            SELECT c.title,cu.customer_name,u.full_name,d.code,c.contract_value,c.status::text,c.version,
                r.round_id,r.round_no,r.record_version,r.result::text,r.submitted_at,c.content,c.payment_terms,c.owner_id,r.record_snapshot::text,
                c.contract_type,c.start_date,c.end_date,c.contract_code
            FROM qtkd.contract c JOIN qtkd.customer cu ON cu.customer_id=c.customer_id
            JOIN qtkd.user_account u ON u.user_id=c.owner_id JOIN qtkd.department d ON d.department_id=u.department_id
            JOIN LATERAL (SELECT * FROM qtkd.approval_round WHERE contract_id=c.contract_id ORDER BY round_no DESC LIMIT 1) r ON true
            WHERE c.contract_id=@id
            """, ("id", id));
        ReviewDocument doc; Guid owner; string snapshot;
        await using (var r = await cmd.ExecuteReaderAsync(ct))
        {
            if (!await r.ReadAsync(ct)) return null;
            doc = new(id, r.GetString(0), r.GetString(1), r.GetString(2), r.GetString(3), r.GetDecimal(4),
                Status(r.GetString(5)), r.GetInt32(6), r.GetGuid(7), r.GetInt32(8), r.GetInt32(9), Result(r.GetString(10)),
                r.GetDateTime(11), [], r.GetString(12), r.GetString(13), [], ContractType: r.GetString(16), StartDate: r.GetFieldValue<DateOnly>(17), EndDate: r.GetFieldValue<DateOnly>(18), Code: r.GetString(19));
            owner = r.GetGuid(14); snapshot = r.GetString(15);
        }
        using var json = JsonDocument.Parse(snapshot);
        if (!json.RootElement.TryGetProperty("workflow", out var config) || !config.TryGetProperty("stages", out var stages))
            throw new ReviewFailure(409, "WORKFLOW_SNAPSHOT_MISSING");
        var configured = stages.EnumerateArray().Select(s => s.ValueKind == JsonValueKind.String ? s.GetString()! : s.GetProperty("key").GetString()!).ToArray();
        await using var stepsCommand = Command(c, tx, """
            SELECT s.step_id,s.step_order,s.assignee_id,u.full_name,s.step_status::text,s.decision::text,s.comment,s.decided_at
            FROM qtkd.approval_step s LEFT JOIN qtkd.user_account u ON u.user_id=s.assignee_id
            WHERE s.round_id=@round ORDER BY s.step_order
            """, ("round", doc.RoundId));
        var steps = new List<ReviewStep>();
        await using (var r = await stepsCommand.ExecuteReaderAsync(ct)) while (await r.ReadAsync(ct))
        {
            var order = r.GetInt32(1);
            if (order < 1 || order > configured.Length) throw new ReviewFailure(409, "WORKFLOW_SNAPSHOT_MISSING");
            var key = configured[order - 1] switch { "SalesManager" or "sales" => "sales", "LegalStaff" or "legal" => "legal", "BoardMember" or "board" => "board", _ => throw new ReviewFailure(409, "WORKFLOW_CONFIGURATION_INVALID") };
            var completed = r.GetString(4) == "Completed";
            var previousApproved = steps.All(s => s.State == "done" && s.Decision == "approve" && s.ReviewedVersion == doc.SubmittedVersion);
            var state = ApprovalStageState.Project(r.GetString(4), !r.IsDBNull(2), previousApproved, doc.RoundResult == "in-progress");
            var decision = r.IsDBNull(5) ? null : r.GetString(5) switch { "Approve" => "approve", "RequestRevision" => "revision", _ => "reject" };
            steps.Add(new(r.GetGuid(0), key, order, r.IsDBNull(2) ? null : r.GetGuid(2), r.IsDBNull(3) ? null : r.GetString(3), state,
                decision, completed ? doc.SubmittedVersion : null, r.IsDBNull(6) ? null : r.GetString(6), r.IsDBNull(7) ? null : r.GetDateTime(7), key == "legal"));
        }
        var attachments = new List<ReviewAttachment>();
        await using var attachmentsCommand = Command(c, tx, "SELECT file_name,file_path FROM qtkd.attachment WHERE contract_id=@id", ("id", id));
        await using (var r = await attachmentsCommand.ExecuteReaderAsync(ct)) while (await r.ReadAsync(ct)) attachments.Add(new(r.GetString(0), r.GetString(1)));
        await using var pendingCommand = Command(c, tx, "SELECT EXISTS(SELECT 1 FROM qtkd.notification WHERE record_type='Contract' AND record_id=@id AND send_status IN ('Pending','Failed'))", ("id", id));
        var notificationPending = (bool)(await pendingCommand.ExecuteScalarAsync(ct))!;
        var pending = string.Join(" ", new[] {
            doc.RoundResult == "in-progress" && steps.Any(s => s.State == "unassigned") ? "Bước hiện tại đang chờ trưởng bộ phận phân công." : null,
            notificationPending ? "Thông báo đang chờ gửi; kết quả duyệt đã được lưu." : null,
        }.Where(part => part is not null));
        var services = new List<ReviewService>();
        await using var serviceCommand = Command(c, tx, "SELECT s.service_name,i.area_name_snapshot,s.unit FROM qtkd.contract_item i JOIN qtkd.service s USING(service_id) WHERE i.contract_id=@id", ("id", id));
        await using (var r = await serviceCommand.ExecuteReaderAsync(ct)) while (await r.ReadAsync(ct)) services.Add(new(r.GetString(0), r.GetString(1), r.GetString(2)));
        return new(doc with { Steps = steps, Attachments = attachments, PendingTask = pending.Length == 0 ? null : pending, Services = services }, owner);
    }
    private static string Status(string value) => value switch { "Submitted" => "submitted", "UnderReview" => "under-review", "RevisionRequested" => "revision-requested", "Approved" => "approved", "Rejected" => "rejected", "Cancelled" => "cancelled", _ => "draft" };
    private static string Result(string value) => value switch { "Running" => "in-progress", "Completed" => "completed", "RevisionRequested" => "revision", "Rejected" => "rejected", _ => "withdrawn" };
}

public sealed class PostgresApprovalTransaction(NpgsqlConnection connection, NpgsqlTransaction transaction, ReviewDocument document, Guid ownerId, string? ip = null) : IApprovalTransaction
{
    public ReviewDocument Document => document;
    public Guid OwnerId => ownerId;
    public async Task<IReadOnlyList<Guid>> AssignmentManagers(string step, CancellationToken ct)
    {
        await using var command = PostgresApprovalStore.Command(connection, transaction, """
            SELECT DISTINCT u.user_id FROM qtkd.department d JOIN qtkd.user_account u ON u.user_id=d.manager_id
            JOIN qtkd.role_permission p ON p.role=u.role AND p.permission_code='approvals.assign'
            WHERE d.code=@department AND u.status='Active' AND NOT u.must_change_password
              AND u.role::text = ANY(@roles)
            """, ("department", step == "legal" ? "PC" : "BGD"),
            ("roles", step == "legal" ? new[] { "LegalManager" } : new[] { "BoardChair" }));
        var recipients = new List<Guid>();
        await using var reader = await command.ExecuteReaderAsync(ct);
        while (await reader.ReadAsync(ct)) recipients.Add(reader.GetGuid(0));
        return recipients;
    }
    public async Task AssertActor(ReviewActor actor, CancellationToken ct)
    {
        await using var cmd = PostgresApprovalStore.Command(connection, transaction, """
            SELECT u.role::text,d.code FROM qtkd.user_account u JOIN qtkd.department d USING(department_id)
            JOIN qtkd.role_permission p ON p.role=u.role AND p.permission_code=@permission
            WHERE u.user_id=@actor AND u.status='Active' AND NOT u.must_change_password FOR SHARE OF u,p
            """, ("permission", actor.Permission), ("actor", actor.Id));
        await using var r = await cmd.ExecuteReaderAsync(ct);
        if (!await r.ReadAsync(ct)) throw new ReviewFailure(403, "FORBIDDEN");
        var role = r.GetString(0) switch { "SalesManager" => "TP_KD", "LegalStaff" => "NV_PC", "LegalManager" => "TP_PC", "BoardMember" => "GD", "BoardChair" => "TGD", _ => "" };
        if (role != actor.Role || r.GetString(1) != actor.Department) throw new ReviewFailure(403, "FORBIDDEN");
    }
    public async Task<ApprovalReceipt?> Receipt(Guid actorId, string key, CancellationToken ct)
    {
        await using var cmd = PostgresApprovalStore.Command(connection, transaction, """
            SELECT value_after::text FROM qtkd.audit_log WHERE entity_type='ContractApproval' AND entity_id=@id
            AND actor_id=@actor AND value_after->>'key'=@key ORDER BY acted_at DESC LIMIT 1
            """, ("id", Document.Id), ("actor", actorId), ("key", key));
        var value = await cmd.ExecuteScalarAsync(ct) as string;
        if (value is null) return null;
        using var json = JsonDocument.Parse(value);
        return new(json.RootElement.GetProperty("fingerprint").GetString()!, json.RootElement.GetProperty("outcome").Deserialize<ReviewOutcome>()!);
    }
    public async Task Save(ReviewCommand command, ReviewDocument next, string fingerprint, IReadOnlyList<ApprovalMessage> messages, CancellationToken ct)
    {
        foreach (var s in next.Steps.OrderBy(s => s.Order))
        {
            var before = Document.Steps.Single(x => x.Id == s.Id);
            if (s == before) continue;
            var status = s.State switch { "done" => "Completed", "reviewing" => "Reviewing", "pending-accept" => "Pending", "stopped" => "Skipped", _ => "NotStarted" };
            var decision = s.Decision switch { "approve" => "Approve", "revision" => "RequestRevision", "reject" => "Reject", _ => null };
            await using var cmd = PostgresApprovalStore.Command(connection, transaction, """
                UPDATE qtkd.approval_step SET step_status=@status::qtkd.approval_step_status,decision=@decision::qtkd.approval_decision,
                comment=@comment,legal_conclusion=@legal,decided_by=@by::uuid,decided_at=@at::timestamptz,
                assigned_at=CASE WHEN @status IN ('Pending','Reviewing') THEN COALESCE(assigned_at,now()) ELSE assigned_at END,
                accepted_at=CASE WHEN @status='Reviewing' THEN COALESCE(accepted_at,now()) ELSE accepted_at END WHERE step_id=@id
                """, ("status", status), ("decision", decision), ("comment", s.Comment), ("legal", s.Key == "legal" ? s.Comment : null),
                ("by", s.State == "done" ? command.Actor.Id : null), ("at", s.DecidedAt), ("id", s.Id));
            await cmd.ExecuteNonQueryAsync(ct);
        }
        if (next.RoundResult != Document.RoundResult)
        {
            var result = next.RoundResult switch { "completed" => "Completed", "revision" => "RevisionRequested", "rejected" => "Rejected", _ => "Running" };
            await using var cmd = PostgresApprovalStore.Command(connection, transaction,
                "UPDATE qtkd.approval_round SET result=@result::qtkd.approval_result,ended_at=now() WHERE round_id=@round",
                ("result", result), ("round", next.RoundId));
            await cmd.ExecuteNonQueryAsync(ct);
        }
        var sourceStatus = next.Status switch { "approved" => "Approved", "revision-requested" => "RevisionRequested", "rejected" => "Rejected", _ => "UnderReview" };
        await using (var cmd = PostgresApprovalStore.Command(connection, transaction,
            "UPDATE qtkd.contract SET status=@status::qtkd.contract_status WHERE contract_id=@id AND version=@version",
            ("status", sourceStatus), ("id", next.Id), ("version", next.Version)))
            if (await cmd.ExecuteNonQueryAsync(ct) != 1) throw new ReviewFailure(409, "VERSION_MISMATCH");
        foreach (var message in messages)
        {
            await using var cmd = PostgresApprovalStore.Command(connection, transaction, """
                INSERT INTO qtkd.notification(notification_id,recipient_id,record_type,record_id,content,is_read,send_status,created_at)
                VALUES(gen_random_uuid(),@recipient,'Contract',@id,@content,false,'Pending',now())
                """, ("recipient", message.RecipientId), ("id", next.Id), ("content", message.Content));
            await cmd.ExecuteNonQueryAsync(ct);
        }
        // Audit action names are UPPER_SNAKE_CASE; command.Action stays the API verb.
        var action = command.Action switch
        {
            "accept" => "REVIEW_ACCEPTED", "handoff" => "REVIEW_HANDED_OFF",
            "approve" when command.Expected.Step == "legal" => "REVIEW_APPROVED_AND_FORWARDED", "approve" => "REVIEW_APPROVED",
            "revision" => "REVIEW_REVISION_REQUESTED", "reject" => "REVIEW_REJECTED", var other => other,
        };
        await using var audit = PostgresApprovalStore.Command(connection, transaction, """
            INSERT INTO qtkd.audit_log(log_id,entity_type,entity_id,action,actor_id,acted_at,status_before,status_after,value_after,note,ip_address)
            VALUES(gen_random_uuid(),'ContractApproval',@id,@action,@actor,now(),@before,@after,@value::jsonb,@note,@ip)
            """, ("id", next.Id), ("action", action), ("actor", command.Actor.Id), ("before", Document.Status), ("after", next.Status),
            ("value", JsonSerializer.Serialize(new { key = command.IdempotencyKey, fingerprint, outcome = new ReviewOutcome(next, next.PendingTask),
                roundId = next.RoundId, stepId = command.Expected.StepId, version = next.SubmittedVersion })), ("note", command.Comment), ("ip", ip));
        await audit.ExecuteNonQueryAsync(ct);
    }
}
