using QTKD.Application.Features.Audit;
using QTKD.Domain.Contracts;
using Xunit;

namespace QTKD.UnitTests.Audit;

public sealed class AuditLogValidatorTests
{
    private static readonly DateTime Now = new(2026, 11, 6, 10, 0, 0, DateTimeKind.Utc);

    private static (string Field, string Reason) Error(AuditLogListQuery request)
    {
        var error = Assert.Throws<BusinessException>(() => AuditLogValidator.Query(request, Now));
        Assert.Equal(("VALIDATION", 400), (error.Code, error.Status));
        var details = error.Details!;
        return ((string)details.GetType().GetProperty("field")!.GetValue(details)!, (string)details.GetType().GetProperty("reason")!.GetValue(details)!);
    }

    [Fact]
    public void Defaults_to_the_last_seven_days_first_page_twenty_rows()
    {
        var query = AuditLogValidator.Query(new AuditLogListQuery(), Now);
        Assert.Equal((Now.AddDays(-7), Now, 1, 20), (query.From, query.To, query.Page, query.PageSize));
    }

    [Fact]
    public void Missing_start_is_seven_days_before_the_given_end_and_times_are_utc()
    {
        var query = AuditLogValidator.Query(new AuditLogListQuery { To = "2026-11-01T07:00:00+07:00" }, Now);
        Assert.Equal(new DateTime(2026, 11, 1, 0, 0, 0, DateTimeKind.Utc), query.To);
        Assert.Equal(query.To!.Value.AddDays(-7), query.From);
    }

    [Fact]
    public void Record_scoped_search_has_no_default_window_or_range_limit()
    {
        var id = Guid.NewGuid();
        var query = AuditLogValidator.Query(new AuditLogListQuery { EntityType = " Contract ", EntityId = id.ToString() }, Now);
        Assert.Equal(((DateTime?)null, (DateTime?)null, "Contract", (Guid?)id), (query.From, query.To, query.EntityType, query.EntityId));

        var wide = AuditLogValidator.Query(new AuditLogListQuery { EntityId = id.ToString(), From = "2020-01-01", To = "2026-01-01" }, Now);
        Assert.Equal(new DateTime(2020, 1, 1, 0, 0, 0, DateTimeKind.Utc), wide.From);
    }

    [Theory]
    [InlineData("not-a-date", null, "from", "INVALID_DATE")]
    [InlineData("2026-11-05", "2026-11-01", "to", "RANGE_INVERTED")]
    [InlineData("2025-01-01", "2026-11-01", "from", "RANGE_TOO_LONG")]
    public void Invalid_time_window_names_the_field(string? from, string? to, string field, string reason) =>
        Assert.Equal((field, reason), Error(new AuditLogListQuery { From = from, To = to }));

    [Fact]
    public void Invalid_ids_text_and_paging_name_the_field()
    {
        Assert.Equal(("actorId", "INVALID_ID"), Error(new AuditLogListQuery { ActorId = "x" }));
        Assert.Equal(("action", "TOO_LONG"), Error(new AuditLogListQuery { Action = new string('a', 101) }));
        Assert.Equal(("page", "OUT_OF_RANGE"), Error(new AuditLogListQuery { Page = 0 }));
        Assert.Equal(("pageSize", "OUT_OF_RANGE"), Error(new AuditLogListQuery { PageSize = 101 }));
    }
}
