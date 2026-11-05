using QTKD.Domain.Contracts;

namespace QTKD.Application.Features.Notifications;

public static class NotificationValidator
{
    /// <summary>Defaults to all, first page, 20 per page. Unknown filter or out-of-range paging is 400 VALIDATION.</summary>
    public static NotificationQuery Query(NotificationListQuery request)
    {
        var unread = request.Filter switch
        {
            null or "" or "all" => false,
            "unread" => true,
            _ => throw new BusinessException("VALIDATION", 400),
        };
        var page = request.Page ?? 1;
        var size = request.PageSize ?? NotificationQuery.DefaultPageSize;
        if (page < 1 || size < 1 || size > NotificationQuery.MaxPageSize)
        {
            throw new BusinessException("VALIDATION", 400);
        }

        return new NotificationQuery(unread, page, size);
    }
}
