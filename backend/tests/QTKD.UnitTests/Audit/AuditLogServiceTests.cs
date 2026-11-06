using System.Text.Json;
using QTKD.Application.Common.Interfaces;
using QTKD.Application.Features.Audit;
using QTKD.Domain.Contracts;
using Xunit;

namespace QTKD.UnitTests.Audit;

// AuditLogService with a fake repository: every lookup and rejected change is appended, detail diff and NOT_FOUND.
public sealed class AuditLogServiceTests
{
    private readonly Actor admin = new(Guid.NewGuid(), "SystemAdmin", Guid.NewGuid(), "Admin");
    private readonly FakeRepository repository = new();
    private AuditLogService Service() => new(repository, TimeProvider.System);

    private static AuditLogRecord Record(string? before = null, string? after = null, string? statusBefore = null, string? statusAfter = null) =>
        new(Guid.NewGuid(), DateTime.UtcNow, Guid.NewGuid(), "Người lập", "CONTRACT_SUBMITTED", "Contract", Guid.NewGuid(),
            statusBefore, statusAfter, before, after, "Lượt 1", "10.0.0.1");

    [Fact]
    public async Task Search_returns_the_applied_window_and_records_the_filter()
    {
        repository.Items = [Record()];
        var page = await Service().Search(admin, "127.0.0.1", new AuditLogListQuery { Action = "CONTRACT_SUBMITTED" }, default);

        Assert.Equal((1, 1, 1, 20), (page.Items.Count, page.Total, page.Page, page.PageSize));
        Assert.NotNull(page.From);
        var entry = Assert.Single(repository.Appended);
        Assert.Equal((admin.Id, AuditActions.Search, AuditActions.EntityType, (Guid?)null, "127.0.0.1"),
            (entry.ActorId, entry.Action, entry.EntityType, entry.EntityId, entry.IpAddress));
        Assert.Contains("CONTRACT_SUBMITTED", JsonSerializer.Serialize(entry.ValueAfter));
    }

    [Fact]
    public async Task Invalid_filter_is_rejected_before_the_repository()
    {
        await Assert.ThrowsAsync<BusinessException>(() => Service().Search(admin, null, new AuditLogListQuery { Page = 0 }, default));
        Assert.Null(repository.Searched);
        Assert.Empty(repository.Appended);
    }

    [Fact]
    public async Task Detail_lists_changed_fields_status_first_and_records_the_view()
    {
        var record = Record("""{"title":"A","value":1,"same":true}""", """{"title":"B","same":true,"extra":"x"}""", "Draft", "Submitted");
        repository.Items = [record];

        var detail = await Service().Detail(admin, null, record.Id, default);

        Assert.Equal(["status", "title", "value", "extra"], detail.Changes.Select(c => c.Field));
        Assert.Equal("Lượt 1", detail.Note);
        Assert.Equal((AuditActions.View, (Guid?)record.Id), (repository.Appended.Single().Action, repository.Appended.Single().EntityId));
    }

    [Fact]
    public async Task Missing_row_is_not_found_and_nothing_is_recorded()
    {
        var error = await Assert.ThrowsAsync<BusinessException>(() => Service().Detail(admin, null, Guid.NewGuid(), default));
        Assert.Equal(("NOT_FOUND", 404), (error.Code, error.Status));
        Assert.Empty(repository.Appended);
    }

    [Fact]
    public async Task Change_attempt_is_recorded_then_refused()
    {
        var target = Guid.NewGuid();
        var error = await Service().RejectMutation(admin, null, "DELETE", target, default);
        Assert.Equal(("AUDIT_IMMUTABLE", 405), (error.Code, error.Status));
        var entry = Assert.Single(repository.Appended);
        Assert.Equal((AuditActions.MutationRejected, (Guid?)target), (entry.Action, entry.EntityId));
        Assert.Contains("DELETE", JsonSerializer.Serialize(entry.ValueAfter));
    }

    [Fact]
    public void Non_object_values_are_one_value_change()
    {
        var changes = AuditLogService.Changes(null, null, JsonSerializer.SerializeToElement(1), JsonSerializer.SerializeToElement(2));
        Assert.Equal("value", Assert.Single(changes).Field);
        Assert.Empty(AuditLogService.Changes("A", "A", null, null));
    }

    private sealed class FakeRepository : IAuditLogRepository
    {
        public List<AuditLogRecord> Items { get; set; } = [];
        public AuditQuery? Searched { get; private set; }
        public List<AuditEntry> Appended { get; } = [];

        public Task<(IReadOnlyList<AuditLogRecord> Items, int Total)> SearchAsync(AuditQuery query, CancellationToken ct)
        {
            Searched = query;
            return Task.FromResult<(IReadOnlyList<AuditLogRecord>, int)>((Items, Items.Count));
        }

        public Task<AuditLogRecord?> FindAsync(Guid id, CancellationToken ct) => Task.FromResult(Items.SingleOrDefault(i => i.Id == id));

        public Task<AuditFilterOptions> OptionsAsync(CancellationToken ct) => Task.FromResult(new AuditFilterOptions([], [], []));

        public Task AppendAsync(AuditEntry entry, CancellationToken ct)
        {
            Appended.Add(entry);
            return Task.CompletedTask;
        }
    }
}
