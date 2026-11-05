using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using QTKD.Application.Common.Interfaces;
using QTKD.Domain.Contracts;
using QTKD.Domain.Identity;
using QTKD.Infrastructure.Persistence;

namespace QTKD.IntegrationTests;

// The production CurrentActor reads PostgreSQL through PgDatabase, which the SQLite test host does not have.
// Same rule (authenticated sub, active account, own department or managed one) read through the test DbContext.
internal sealed class SqliteCurrentActor(IHttpContextAccessor http, IdentityDbContext db) : ICurrentActor
{
    public async Task<Actor> Get(CancellationToken ct)
    {
        var principal = http.HttpContext?.User;
        if (principal?.Identity?.IsAuthenticated != true || !Guid.TryParse(principal.FindFirst("sub")?.Value, out var id))
            throw new BusinessException("UNAUTHORIZED", 401);
        var user = await db.Users.AsNoTracking().SingleOrDefaultAsync(u => u.UserId == id && u.Status == UserStatus.Active, ct)
            ?? throw new BusinessException("FORBIDDEN", 403);
        var managed = await db.Departments.AsNoTracking()
            .Where(d => d.ManagerId == id && d.DepartmentId == user.DepartmentId).Select(d => (Guid?)d.DepartmentId).SingleOrDefaultAsync(ct);
        return new Actor(id, user.Role.ToString(), user.DepartmentId, user.FullName, managed);
    }
}
