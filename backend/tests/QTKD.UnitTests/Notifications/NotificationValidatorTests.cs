using QTKD.Application.Features.Notifications;
using QTKD.Domain.Contracts;
using Xunit;

namespace QTKD.UnitTests.Notifications;

public sealed class NotificationValidatorTests
{
    private static NotificationQuery Query(string? filter = null, int? page = null, int? pageSize = null)
        => NotificationValidator.Query(new NotificationListQuery { Filter = filter, Page = page, PageSize = pageSize });

    [Fact]
    public void Defaults_to_all_first_page_and_default_size()
        => Assert.Equal(new NotificationQuery(false, 1, NotificationQuery.DefaultPageSize), Query());

    [Theory]
    [InlineData(null, false)]
    [InlineData("", false)]
    [InlineData("all", false)]
    [InlineData("unread", true)]
    public void Filter_selects_unread_only(string? filter, bool unread)
        => Assert.Equal(unread, Query(filter).UnreadOnly);

    [Theory]
    [InlineData(1, 1)]
    [InlineData(7, 20)]
    [InlineData(1, NotificationQuery.MaxPageSize)]
    public void Accepts_paging_within_bounds(int page, int pageSize)
        => Assert.Equal(new NotificationQuery(false, page, pageSize), Query("all", page, pageSize));

    [Theory]
    [InlineData("read", null, null)]
    [InlineData("UNREAD", null, null)]
    [InlineData(null, 0, null)]
    [InlineData(null, -1, null)]
    [InlineData(null, null, 0)]
    [InlineData(null, null, NotificationQuery.MaxPageSize + 1)]
    public void Rejects_unknown_filter_or_out_of_range_paging(string? filter, int? page, int? pageSize)
    {
        var error = Assert.Throws<BusinessException>(() => Query(filter, page, pageSize));
        Assert.Equal((400, "VALIDATION"), (error.Status, error.Code));
    }
}
