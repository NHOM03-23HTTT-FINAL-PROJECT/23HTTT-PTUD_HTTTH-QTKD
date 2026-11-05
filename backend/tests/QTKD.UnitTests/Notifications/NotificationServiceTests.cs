using QTKD.Application.Common.Interfaces;
using QTKD.Application.Features.Notifications;
using QTKD.Domain.Contracts;
using QTKD.Domain.Notifications;
using Xunit;

namespace QTKD.UnitTests.Notifications;

// NotificationService with a fake repository: validation, recipient scoping, NOT_FOUND and entity → DTO mapping.
public sealed class NotificationServiceTests
{
    private readonly Actor actor = new(Guid.NewGuid(), "SalesStaff", Guid.NewGuid(), "Demo");
    private readonly FakeRepository repository = new();
    private NotificationService Service() => new(repository);

    private static NotificationRecord Record(string content, bool read, RecordType type = RecordType.Contract, string? title = "HĐ Demo") =>
        new(new Notification
        {
            NotificationId = Guid.NewGuid(), RecordType = type, RecordId = Guid.NewGuid(), Content = content, IsRead = read,
            CreatedAt = new DateTime(2026, 11, 1, 8, 0, 0, DateTimeKind.Utc),
        }, title);

    [Fact]
    public async Task List_validates_the_request_scopes_to_the_actor_and_maps_kind_and_record_type()
    {
        var assigned = Record(NotificationKinds.Assigned("thẩm định", "HĐ Demo"), read: false);
        repository.Items = [assigned, Record("Thông báo khác", read: true, RecordType.Customer, title: null)];

        var page = await Service().List(actor, new NotificationListQuery { Filter = "unread", Page = 2, PageSize = 5 }, default);

        Assert.Equal((actor.Id, new NotificationQuery(true, 2, 5)), repository.Listed);
        Assert.Equal((2, 1, 2, 5), (page.Total, page.UnreadCount, page.Page, page.PageSize));
        var first = page.Items[0];
        Assert.Equal((assigned.Entity.NotificationId, NotificationKinds.ReviewAssigned, "Contract", "HĐ Demo", false),
            (first.Id, first.Kind, first.RecordType, first.RecordTitle, first.IsRead));
        Assert.Equal(("Customer", NotificationKinds.General, (string?)null), (page.Items[1].RecordType, page.Items[1].Kind, page.Items[1].RecordTitle));
    }

    [Fact]
    public async Task Invalid_request_is_rejected_before_the_repository()
    {
        var error = await Assert.ThrowsAsync<BusinessException>(() => Service().List(actor, new NotificationListQuery { Filter = "read" }, default));
        Assert.Equal(("VALIDATION", 400), (error.Code, error.Status));
        Assert.Null(repository.Listed);
    }

    [Fact]
    public async Task Missing_or_foreign_notification_is_not_found()
    {
        var error = await Assert.ThrowsAsync<BusinessException>(() => Service().MarkRead(actor, Guid.NewGuid(), default));
        Assert.Equal(("NOT_FOUND", 404), (error.Code, error.Status));
    }

    [Fact]
    public async Task Mark_read_count_and_mark_all_use_the_actor_as_recipient()
    {
        var record = Record("Chưa đọc", read: false);
        repository.Items = [record];

        var item = await Service().MarkRead(actor, record.Entity.NotificationId, default);
        Assert.True(item.IsRead);
        Assert.Equal((actor.Id, record.Entity.NotificationId), repository.Read);
        Assert.Equal(0, (await Service().UnreadCount(actor, default)).Count);
        Assert.Equal(0, (await Service().MarkAllRead(actor, default)).Updated);
        Assert.All(repository.Recipients, r => Assert.Equal(actor.Id, r));
    }

    private sealed class FakeRepository : INotificationRepository
    {
        public List<NotificationRecord> Items = [];
        public (Guid, NotificationQuery)? Listed;
        public (Guid, Guid)? Read;
        public readonly List<Guid> Recipients = [];

        public Task<(IReadOnlyList<NotificationRecord> Items, int Total, int Unread)> ListAsync(Guid recipient, NotificationQuery query, CancellationToken ct)
        {
            Listed = (recipient, query);
            return Task.FromResult<(IReadOnlyList<NotificationRecord>, int, int)>((Items, Items.Count, Items.Count(x => !x.Entity.IsRead)));
        }

        public Task<int> CountUnreadAsync(Guid recipient, CancellationToken ct)
        {
            Recipients.Add(recipient);
            return Task.FromResult(Items.Count(x => !x.Entity.IsRead));
        }

        public Task<NotificationRecord?> MarkReadAsync(Guid recipient, Guid id, CancellationToken ct)
        {
            Read = (recipient, id);
            var record = Items.FirstOrDefault(x => x.Entity.NotificationId == id);
            if (record is not null) record.Entity.IsRead = true;
            return Task.FromResult(record);
        }

        public Task<int> MarkAllReadAsync(Guid recipient, CancellationToken ct)
        {
            Recipients.Add(recipient);
            var unread = Items.Where(x => !x.Entity.IsRead).ToList();
            unread.ForEach(x => x.Entity.IsRead = true);
            return Task.FromResult(unread.Count);
        }
    }
}
