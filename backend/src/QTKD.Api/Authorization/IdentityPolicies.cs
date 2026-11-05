using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using QTKD.Application.Features.Identity;

namespace QTKD.Api.Authorization;

public sealed class BusinessReady : IAuthorizationRequirement;
public sealed record PermissionRequirement(string Code) : IAuthorizationRequirement;
public sealed class ResourceRequirement : IAuthorizationRequirement;
public sealed class IdentityPolicyHandler(IIdentityService identity, IHttpContextAccessor accessor) :
    AuthorizationHandler<PermissionRequirement>
{
    protected override async Task HandleRequirementAsync(AuthorizationHandlerContext context, PermissionRequirement requirement)
    {
        if (Guid.TryParse(context.User.FindFirstValue("sub"), out var userId)
            && await identity.HasPermission(userId, requirement.Code, accessor.HttpContext?.RequestAborted ?? default)) context.Succeed(requirement);
    }
}
public sealed class BusinessReadyHandler : AuthorizationHandler<BusinessReady>
{
    protected override Task HandleRequirementAsync(AuthorizationHandlerContext context, BusinessReady requirement)
    {
        if (context.User.Identity?.IsAuthenticated == true && context.User.FindFirstValue("must_change_password") == "false") context.Succeed(requirement);
        return Task.CompletedTask;
    }
}
public sealed class ResourceAccessHandler(IIdentityService identity) : AuthorizationHandler<ResourceRequirement, ResourceAccess>
{
    protected override async Task HandleRequirementAsync(AuthorizationHandlerContext context, ResourceRequirement requirement, ResourceAccess resource)
    {
        if (Guid.TryParse(context.User.FindFirstValue("sub"), out var userId) && resource.InScope && resource.StateAllowsAction
            && (resource.OwnerId is null || resource.OwnerId == userId) && (resource.AssigneeId is null || resource.AssigneeId == userId)
            && await identity.HasPermission(userId, resource.Permission, default)) context.Succeed(requirement);
    }
}
public static class PermissionCatalog
{
    public static readonly string[] Codes = ["customers.view", "customers.create", "customers.update", "customers.change-status",
        "contracts.view", "contracts.create", "approvals.track", "approvals.review-legal", "approvals.approve", "approvals.assign",
        "areas.view", "areas.create", "areas.update", "areas.manage", "payments.view", "users.manage", "departments.manage",
        "roles.manage", "workflows.manage", "audit.view", "catalogs.manage"];
}
