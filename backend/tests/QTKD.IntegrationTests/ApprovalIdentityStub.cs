using QTKD.Application.Features.Identity;
using QTKD.Domain.Identity;

namespace QTKD.IntegrationTests;

// Only the outer identity projection is stubbed for rollback SQL checks. Transactional
// role/grant/department authorization still reads the real synthetic PostgreSQL accounts.
internal sealed class ApprovalIdentityStub(IReadOnlyDictionary<Guid, AuthUser> users) : IIdentityService
{
    public Task<AuthUser> User(Guid id, CancellationToken ct) => Task.FromResult(users[id]);
    public Task<bool> HasPermission(Guid id, string permission, CancellationToken ct) => Task.FromResult(users[id].Permissions.Contains(permission));
    public Task<AuthResult> Login(LoginRequest request, string? ip, string? device, CancellationToken ct) => throw new NotSupportedException();
    public Task<AuthResult> Refresh(string token, CancellationToken ct) => throw new NotSupportedException();
    public Task Logout(string? token, CancellationToken ct) => throw new NotSupportedException();
    public Task<SessionView> Session(Guid user, Guid session, bool activity, CancellationToken ct) => throw new NotSupportedException();
    public Task<AuthResult> ChangePassword(Guid user, Guid session, PasswordRequest request, string? token, CancellationToken ct) => throw new NotSupportedException();
    public Task<IReadOnlyList<AuthUser>> Users(CancellationToken ct) => throw new NotSupportedException();
    public Task<AuthUser> CreateUser(CreateUserRequest request, CancellationToken ct) => throw new NotSupportedException();
    public Task<AuthUser> UpdateUser(Guid actor, Guid user, UpdateUserRequest request, CancellationToken ct) => throw new NotSupportedException();
    public Task<IReadOnlyList<Department>> Departments(CancellationToken ct) => throw new NotSupportedException();
    public Task<Department> SaveDepartment(Guid? id, DepartmentRequest request, CancellationToken ct) => throw new NotSupportedException();
    public Task<object> Roles(CancellationToken ct) => throw new NotSupportedException();
    public Task<string[]> Permissions(CancellationToken ct) => throw new NotSupportedException();
    public Task SaveGrants(string role, string[] permissions, CancellationToken ct) => throw new NotSupportedException();
}
