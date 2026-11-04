using QTKD.Application.Features.ContractApprovals;
using Xunit;

namespace QTKD.UnitTests.Notifications;

// Kind is not stored: it is read back from content, so templates and parser must stay in step.
public sealed class NotificationKindsTests
{
    [Fact]
    public void Templates_keep_the_exact_wording_already_stored_in_the_database()
    {
        Assert.Equal("Bạn được phân công rà soát hồ sơ HĐ A.", NotificationKinds.Assigned("rà soát", "HĐ A"));
        Assert.Equal("Bạn không còn được phân công rà soát hồ sơ HĐ A.", NotificationKinds.Revoked("rà soát", "HĐ A"));
        Assert.Equal("Hồ sơ HĐ A: approved. Đồng ý", NotificationKinds.Decision("HĐ A", "approved", "Đồng ý"));
        Assert.Equal("Hồ sơ HĐ A: under-review. ", NotificationKinds.Decision("HĐ A", "under-review", null));
    }

    public static TheoryData<string, string> Templates => new()
    {
        { NotificationKinds.Assigned("rà soát Pháp chế", "HĐ A"), NotificationKinds.ReviewAssigned },
        { NotificationKinds.Revoked("rà soát Pháp chế", "HĐ A"), NotificationKinds.AssignmentRevoked },
        { NotificationKinds.Decision("HĐ A", "under-review", null), NotificationKinds.ReviewRequired },
        { NotificationKinds.Decision("HĐ A", "approved", "Đồng ý"), NotificationKinds.ApprovalResult },
        { NotificationKinds.Decision("HĐ A", "rejected", "Sai giá"), NotificationKinds.ApprovalResult },
        { NotificationKinds.Decision("HĐ A", "revision-requested", "Sửa điều 3"), NotificationKinds.RevisionRequested },
    };

    [Theory]
    [MemberData(nameof(Templates))]
    public void Each_template_reads_back_as_its_kind(string content, string kind) => Assert.Equal(kind, NotificationKinds.Of(content));

    public static TheoryData<string, string> Misleading => new()
    {
        // Title or comment containing another template's wording must not change the kind.
        { NotificationKinds.Assigned("rà soát", "HĐ: approved. A"), NotificationKinds.ReviewAssigned },
        { NotificationKinds.Decision("HĐ A", "rejected", "Sai giá: approved. x"), NotificationKinds.ApprovalResult },
        { NotificationKinds.Decision("HĐ A", "under-review", "Bạn được phân công lại"), NotificationKinds.ReviewRequired },
        { NotificationKinds.Decision("HĐ A\nB", "revision-requested", null), NotificationKinds.RevisionRequested },
    };

    [Theory]
    [MemberData(nameof(Misleading))]
    public void Title_or_comment_text_does_not_change_the_kind(string content, string kind) => Assert.Equal(kind, NotificationKinds.Of(content));

    [Theory]
    [InlineData("Hợp đồng Demo chờ rà soát; dữ liệu thử nghiệm.")]
    [InlineData("")]
    [InlineData("Hồ sơ HĐ A: draft. ")]
    [InlineData("hồ sơ HĐ A: approved. ")]
    [InlineData("Hồ sơ HĐ A: approved.")]
    public void Unknown_content_is_general(string content) => Assert.Equal(NotificationKinds.General, NotificationKinds.Of(content));
}
