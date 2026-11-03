using System.Security.Claims;
using QTKD.Application.Common.Interfaces;
using QTKD.Domain.Contracts;
using QTKD.Infrastructure.Persistence;

namespace QTKD.Api.Authentication;

// Read-only authorization adapter for an identity authenticated by the shared module.
public class CurrentActor : ICurrentActor
{
    private readonly IHttpContextAccessor _http;
    private readonly PgDatabase _db;

    public CurrentActor(IHttpContextAccessor http, PgDatabase db)
    {
        _http = http;
        _db = db;
    }

    public async Task<Actor> Get(CancellationToken ct)
    {
        var principal = _http.HttpContext?.User;
        var subject = principal?.FindFirst("sub")?.Value ?? principal?.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        if (principal?.Identity?.IsAuthenticated != true || !Guid.TryParse(subject, out var id))
        {
            throw new BusinessException("UNAUTHORIZED", 401);
        }

        await using var connection = await _db.Open(ct);
        var row = await PgDatabase.Object(connection, null, """
            SELECT jsonb_build_object('role', u.role, 'department', u.department_id, 'name', u.full_name,
                'managed', (SELECT d.department_id FROM qtkd.department d
                    WHERE d.manager_id = u.user_id AND d.department_id = u.department_id))
            FROM qtkd.user_account u WHERE u.user_id = $1 AND u.status = 'Active'
            """, ct, id);
        if (row is null)
        {
            throw new BusinessException("FORBIDDEN", 403);
        }

        return new Actor(id, row["role"]!.GetValue<string>(),
            Guid.Parse(row["department"]!.GetValue<string>()), row["name"]!.GetValue<string>(),
            row["managed"] is null ? null : Guid.Parse(row["managed"]!.GetValue<string>()));
    }
}
