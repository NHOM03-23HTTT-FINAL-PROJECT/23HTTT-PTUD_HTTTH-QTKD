using System.Reflection;
using System.Text.Json;
using QTKD.Application.Common.Interfaces;
using QTKD.Application.Features.Customers;
using QTKD.Domain.Customers;
using QTKD.Domain.Identity;
using Xunit;

namespace QTKD.UnitTests.Customers;

public sealed class CustomerServiceTests
{
    public class RepositoryDouble : DispatchProxy
    {
        public CustomerActor Actor = new(Guid.NewGuid(), Guid.NewGuid(), UserRole.SalesStaff, "Người thử");
        public CustomerRecord Row = new(Guid.NewGuid(), "Khách", "0123456789", "Địa chỉ", "Đại diện", "", "", "0900000000", "",
            "", [], "Suspended", Guid.NewGuid(), "Đồng nghiệp", 4, null, null, null, "KH-000001", null);
        public readonly TestTransaction Transaction = new();
        public readonly List<string> Calls = [];
        protected override object? Invoke(MethodInfo? method, object?[]? args)
        {
            var name = method!.Name; Calls.Add(name);
            return name switch
            {
                nameof(ICustomerRepository.Begin) => Task.FromResult<ICustomerTransaction>(Transaction),
                nameof(ICustomerRepository.AuthorizeMutation) => Task.FromResult<CustomerActor?>(Actor),
                nameof(ICustomerRepository.SessionValid) or nameof(ICustomerRepository.HasPermission) => Task.FromResult(true),
                nameof(ICustomerRepository.LockRequest) => Task.CompletedTask,
                nameof(ICustomerRepository.Find) => Task.FromResult<CustomerRecord?>(Row),
                nameof(ICustomerRepository.Receipt) => Task.FromResult<CustomerReceipt?>(null),
                nameof(ICustomerRepository.History) => Task.FromResult(Array.Empty<string>()),
                nameof(ICustomerRepository.Decisions) => Task.FromResult(new[] { new CustomerDecision("Suspend", "Lý do cũ", null, null, "Trưởng phòng", DateTime.UtcNow, null) }),
                _ => throw new InvalidOperationException("Unexpected persistence call: " + name)
            };
        }
    }
    public sealed class TestTransaction : ICustomerTransaction
    {
        public bool Committed, Disposed;
        public Task Commit(CancellationToken ct) { Committed = true; return Task.CompletedTask; }
        public ValueTask DisposeAsync() { Disposed = true; return ValueTask.CompletedTask; }
    }
    private sealed class MissingSource : ICustomerStatusSource
    {
        public Task<SuspensionSourceResult> Suspension(Guid customerId, Guid actorId, bool forConfirmation, CancellationToken ct) =>
            Task.FromResult(new SuspensionSourceResult(false, [], ["job"], ["operations_jobs"], "missing", []));
        public Task<ReactivationSourceResult> Reactivation(Guid customerId, Guid actorId, string? reasonGroup, StatusException? exception, CancellationToken ct) =>
            Task.FromResult(new ReactivationSourceResult(false, false, ["authoritative_confirmation"], [], null));
    }
    private static (CustomerService Service, RepositoryDouble Repo) Fixture()
    {
        var repository = DispatchProxy.Create<ICustomerRepository, RepositoryDouble>();
        return (new(repository, new MissingSource()), (RepositoryDouble)repository);
    }
    private static UpdateCustomerRequest Edit(int version) => new(version,
        new CustomerDraft("Tên mới", null, "Địa chỉ", "Đại diện", "", "", "0900000000", "", "", []), "Cập nhật");

    [Fact]
    public async Task Staff_cannot_edit_a_peers_record_and_transaction_is_not_committed()
    {
        var (service, repo) = Fixture();
        var error = await Assert.ThrowsAsync<CustomerFailure>(() => service.Update(repo.Actor.Id, Guid.NewGuid(), repo.Row.Code, "peer-edit", Edit(4), default));
        Assert.Equal((403, "FORBIDDEN"), (error.Status, error.Code));
        Assert.DoesNotContain(nameof(ICustomerRepository.Update), repo.Calls);
        Assert.False(repo.Transaction.Committed); Assert.True(repo.Transaction.Disposed);
    }
    [Fact]
    public async Task Stale_edit_returns_latest_version_without_saving_or_committing()
    {
        var (service, repo) = Fixture(); repo.Row = repo.Row with { OwnerId = repo.Actor.Id };
        var error = await Assert.ThrowsAsync<CustomerFailure>(() => service.Update(repo.Actor.Id, Guid.NewGuid(), repo.Row.Code, "stale-edit", Edit(3), default));
        Assert.Equal((409, "CONFLICT"), (error.Status, error.Code));
        var detail = JsonSerializer.SerializeToElement(error.Detail, new JsonSerializerOptions(JsonSerializerDefaults.Web));
        Assert.Equal(4, detail.GetProperty("latest").GetProperty("version").GetInt32());
        Assert.DoesNotContain(nameof(ICustomerRepository.Update), repo.Calls);
        Assert.False(repo.Transaction.Committed);
    }
    [Fact]
    public async Task Missing_authoritative_source_never_writes_state_decision_or_history()
    {
        var (service, repo) = Fixture(); repo.Actor = repo.Actor with { Role = UserRole.SalesManager };
        var error = await Assert.ThrowsAsync<CustomerFailure>(() => service.Reactivate(repo.Actor.Id, Guid.NewGuid(), repo.Row.Code,
            "missing-source", new(4, "Tiếp tục hợp tác", [], null), default));
        Assert.Equal((503, "REVIEW_INCOMPLETE"), (error.Status, error.Code));
        Assert.DoesNotContain(nameof(ICustomerRepository.SetStatus), repo.Calls);
        Assert.DoesNotContain(nameof(ICustomerRepository.AddDecision), repo.Calls);
        Assert.DoesNotContain(nameof(ICustomerRepository.Audit), repo.Calls);
        Assert.False(repo.Transaction.Committed);
    }
}
