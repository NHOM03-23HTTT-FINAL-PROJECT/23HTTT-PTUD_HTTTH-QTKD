using System.Text.Json;
using Npgsql;
using NpgsqlTypes;
using QTKD.Application.Features.Customers;
using QTKD.Domain.Identity;

namespace QTKD.Infrastructure.Customers;

public sealed partial class CustomerService
{
    private static void RequireDelegationManager(Actor actor)
    {
        if (actor.Role != UserRole.SalesManager) throw new CustomerFailure(403, "FORBIDDEN");
    }

    private static async Task<bool> CanStatusAction(NpgsqlConnection c, NpgsqlTransaction? tx, Actor actor,
        Row row, string action, CancellationToken ct)
    {
        if (actor.Role == UserRole.SalesManager)
        {
            await using var managerPermission = Cmd(c, tx, """
                SELECT EXISTS (SELECT 1 FROM qtkd.role_permission
                  WHERE role='SalesManager' AND permission_code='customers.change-status')
                """);
            return (bool)(await managerPermission.ExecuteScalarAsync(ct))!;
        }
        if (actor.Role != UserRole.SalesStaff || row.OwnerId != actor.Id) return false;
        await using var permission = Cmd(c, tx, """
            SELECT EXISTS (SELECT 1 FROM qtkd.customer_status_delegation d
              WHERE d.grantee_id=@actor AND d.department_id=@department
                AND d.action=@action::qtkd.customer_decision_type AND d.revoked_at IS NULL
                AND (d.expires_at IS NULL OR d.expires_at > clock_timestamp()))
            """, ("actor", actor.Id), ("department", actor.DepartmentId), ("action", action));
        return (bool)(await permission.ExecuteScalarAsync(ct))!;
    }

    private static async Task RequireStatusPermission(NpgsqlConnection c, NpgsqlTransaction? tx, Actor actor,
        Row row, string action, CancellationToken ct)
    {
        if (!await CanStatusAction(c, tx, actor, row, action, ct)) throw new CustomerFailure(403, "FORBIDDEN");
    }

    public async Task<CustomerStatusPermissions> GetStatusPermissions(Guid actorId, string code, CancellationToken ct)
    {
        var actor = await GetActor(actorId, ct);
        await using var c = Connection(); await c.OpenAsync(ct);
        var row = await Find(c, null, actor, ParseCode(code), false, ct);
        return new CustomerStatusPermissions(false,
            await CanStatusAction(c, null, actor, row, "Reactivate", ct));
    }

    public async Task<StatusDelegationCandidate[]> DelegationCandidates(Guid actorId, CancellationToken ct)
    {
        var actor = await GetActor(actorId, ct); RequireDelegationManager(actor);
        await using var c = Connection(); await c.OpenAsync(ct);
        await using var cmd = Cmd(c, null, """
            SELECT user_id,full_name,username FROM qtkd.user_account
            WHERE department_id=@department AND role='SalesStaff' AND status='Active'
            ORDER BY full_name,username
            """, ("department", actor.DepartmentId));
        await using var reader = await cmd.ExecuteReaderAsync(ct);
        var result = new List<StatusDelegationCandidate>();
        while (await reader.ReadAsync(ct)) result.Add(new(reader.GetGuid(0), reader.GetString(1), reader.GetString(2)));
        return result.ToArray();
    }

    private const string DelegationSelect = """
        SELECT d.delegation_id,d.grantee_id,grantee.full_name,grantee.username,d.action::text,d.reason,
          grantor.full_name,d.granted_at,d.expires_at,d.revoked_at,revoker.full_name,
          CASE WHEN d.revoked_at IS NOT NULL THEN 'revoked'
            WHEN d.expires_at IS NOT NULL AND d.expires_at <= clock_timestamp() THEN 'expired'
            WHEN grantee.status <> 'Active' OR grantee.role <> 'SalesStaff' OR grantee.department_id <> d.department_id THEN 'ineligible'
            ELSE 'active' END
        FROM qtkd.customer_status_delegation d
        JOIN qtkd.user_account grantee ON grantee.user_id=d.grantee_id
        JOIN qtkd.user_account grantor ON grantor.user_id=d.granted_by
        LEFT JOIN qtkd.user_account revoker ON revoker.user_id=d.revoked_by
        WHERE d.department_id=@department
        """;

    private static StatusDelegationView ReadDelegation(NpgsqlDataReader r) => new(
        r.GetGuid(0), r.GetGuid(1), r.GetString(2), r.GetString(3), r.GetString(4).ToLowerInvariant(),
        r.IsDBNull(5) ? null : r.GetString(5), r.GetString(6), r.GetDateTime(7),
        r.IsDBNull(8) ? null : r.GetDateTime(8), r.IsDBNull(9) ? null : r.GetDateTime(9),
        r.IsDBNull(10) ? null : r.GetString(10), r.GetString(11));

    private static async Task<StatusDelegationView> FindDelegation(NpgsqlConnection c, NpgsqlTransaction? tx,
        Guid department, Guid id, CancellationToken ct)
    {
        await using var cmd = Cmd(c, tx, DelegationSelect + " AND d.delegation_id=@id", ("department", department), ("id", id));
        await using var reader = await cmd.ExecuteReaderAsync(ct);
        return await reader.ReadAsync(ct) ? ReadDelegation(reader) : throw new CustomerFailure(404, "NOT_FOUND");
    }

    public async Task<StatusDelegationView[]> Delegations(Guid actorId, CancellationToken ct)
    {
        var actor = await GetActor(actorId, ct); RequireDelegationManager(actor);
        await using var c = Connection(); await c.OpenAsync(ct);
        await using var cmd = Cmd(c, null, DelegationSelect + " ORDER BY d.granted_at DESC,d.delegation_id", ("department", actor.DepartmentId));
        await using var reader = await cmd.ExecuteReaderAsync(ct);
        var result = new List<StatusDelegationView>();
        while (await reader.ReadAsync(ct)) result.Add(ReadDelegation(reader));
        return result.ToArray();
    }

    private static async Task AuditDelegation(NpgsqlConnection c, NpgsqlTransaction tx, Actor actor,
        StatusDelegationView delegation, string action, CancellationToken ct)
    {
        await using var cmd = Cmd(c, tx, """
            INSERT INTO qtkd.audit_log(entity_type,entity_id,action,actor_id,acted_at,value_after,note)
            VALUES ('CustomerDelegation',@id,@action,@actor,clock_timestamp(),@value,@note::text)
            """, ("id", delegation.Id), ("action", action), ("actor", actor.Id), ("note", delegation.Reason));
        cmd.Parameters.AddWithValue("value", NpgsqlDbType.Jsonb, JsonSerializer.Serialize(new
        {
            delegation.GranteeId, delegation.Action, actor.DepartmentId, delegation.ExpiresAt,
            delegation.RevokedAt, scope = "assigned_customers", delegation.Reason
        }, Json));
        await cmd.ExecuteNonQueryAsync(ct);
    }

    public async Task<StatusDelegationView> GrantDelegation(Guid actorId, Guid sessionId,
        GrantStatusDelegationRequest request, CancellationToken ct)
    {
        var action = request.Action == "reactivate" ? "Reactivate" : null;
        var reason = (request.Reason ?? "").Trim();
        if (request.GranteeId == Guid.Empty || action is null || reason.Length > 1000)
            throw new CustomerFailure(400, "VALIDATION");
        await using var c = Connection(); await c.OpenAsync(ct); await using var tx = await c.BeginTransactionAsync(ct);
        // Serializes this decision with role changes, status actions and other grants/revocations.
        var actor = await AuthorizeMutation(c, tx, actorId, sessionId, "customers.change-status", ct, exclusiveAdministration: true);
        RequireDelegationManager(actor);
        await using (var candidate = Cmd(c, tx, """
            SELECT EXISTS (SELECT 1 FROM qtkd.user_account WHERE user_id=@id AND user_id<>@actor
              AND department_id=@department AND role='SalesStaff' AND status='Active')
            """, ("id", request.GranteeId), ("actor", actor.Id), ("department", actor.DepartmentId)))
            if (!(bool)(await candidate.ExecuteScalarAsync(ct))!) throw new CustomerFailure(400, "DELEGATION_RECIPIENT_INVALID");
        if (request.ExpiresAt is { } expires)
        {
            await using var expiry = Cmd(c, tx, "SELECT @expires::timestamptz > clock_timestamp()", ("expires", expires.UtcDateTime));
            if (!(bool)(await expiry.ExecuteScalarAsync(ct))!) throw new CustomerFailure(400, "DELEGATION_EXPIRY_INVALID");
        }
        await using (var duplicate = Cmd(c, tx, """
            SELECT EXISTS (SELECT 1 FROM qtkd.customer_status_delegation WHERE grantee_id=@id AND department_id=@department
              AND action=@action::qtkd.customer_decision_type AND revoked_at IS NULL
              AND (expires_at IS NULL OR expires_at > clock_timestamp()))
            """, ("id", request.GranteeId), ("department", actor.DepartmentId), ("action", action)))
            if ((bool)(await duplicate.ExecuteScalarAsync(ct))!) throw new CustomerFailure(409, "DELEGATION_EXISTS");
        Guid id;
        await using (var insert = Cmd(c, tx, """
            INSERT INTO qtkd.customer_status_delegation(grantee_id,granted_by,department_id,action,reason,expires_at)
            VALUES (@grantee,@actor,@department,@action::qtkd.customer_decision_type,@reason::text,@expires::timestamptz)
            RETURNING delegation_id
            """, ("grantee", request.GranteeId), ("actor", actor.Id), ("department", actor.DepartmentId),
            ("action", action), ("reason", reason.Length == 0 ? null : reason), ("expires", request.ExpiresAt?.UtcDateTime)))
            id = (Guid)(await insert.ExecuteScalarAsync(ct))!;
        var result = await FindDelegation(c, tx, actor.DepartmentId, id, ct);
        await AuditDelegation(c, tx, actor, result, "CUSTOMER_DELEGATION_GRANTED", ct);
        await tx.CommitAsync(ct); return result;
    }

    public async Task<StatusDelegationView> RevokeDelegation(Guid actorId, Guid sessionId, Guid id, CancellationToken ct)
    {
        await using var c = Connection(); await c.OpenAsync(ct); await using var tx = await c.BeginTransactionAsync(ct);
        var actor = await AuthorizeMutation(c, tx, actorId, sessionId, "customers.change-status", ct, exclusiveAdministration: true);
        RequireDelegationManager(actor);
        var existing = await FindDelegation(c, tx, actor.DepartmentId, id, ct);
        if (existing.RevokedAt is not null) { await tx.CommitAsync(ct); return existing; }
        await using (var update = Cmd(c, tx, """
            UPDATE qtkd.customer_status_delegation SET revoked_at=clock_timestamp(),revoked_by=@actor
            WHERE delegation_id=@id AND department_id=@department
            """, ("actor", actor.Id), ("id", id), ("department", actor.DepartmentId)))
            await update.ExecuteNonQueryAsync(ct);
        var result = await FindDelegation(c, tx, actor.DepartmentId, id, ct);
        await AuditDelegation(c, tx, actor, result, "CUSTOMER_DELEGATION_REVOKED", ct);
        await tx.CommitAsync(ct); return result;
    }
}
