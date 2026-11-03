namespace QTKD.Application.Features.Customers;

public sealed record CustomerDraft(
    string? Name, string? TaxCode, string? Address, string? Representative,
    string? ContactName, string? ContactTitle, string? Phone, string? Email,
    string? CustomerGroup, string[]? ServiceGroups);

public sealed record CreateCustomerRequest(CustomerDraft? Draft);
public sealed record UpdateCustomerRequest(int BaseVersion, CustomerDraft? Draft, string? Reason);
public sealed record CustomerChange(string Field, object Before, object After);
public sealed record CustomerHistory(string Action, string By, DateTime At, int Version,
    int? FromVersion = null, string? Reason = null, CustomerChange[]? Changes = null);
public sealed record CustomerDecisionView(string Type, string Reason, string? Basis, string? FollowUpPlan, string DecidedBy, DateTime At);
public sealed record CustomerView(
    string Code, string Name, string TaxCode, string Address, string Representative,
    string ContactName, string ContactTitle, string Phone, string Email, string CustomerGroup,
    string[] ServiceGroups, string Status, Guid OwnerId, string OwnerName, int Version,
    DateTime? CreatedAt, string? CreatedBy, CustomerHistory[] History, string? LegacyInterestedServices, CustomerDecisionView[] StatusDecisions);
public sealed record CustomerListItem(string Code, string Name, string Address, string TaxCode, string Status, DateTime? UpdatedAt);
public sealed record CustomerSearchResult(CustomerListItem[] Items, int Total, int Page, int Size);
public sealed record CreateCustomerResult(CustomerView Customer, bool Replayed);
public sealed record UpdateCustomerResult(CustomerView Customer, string[] ChangedFields, bool Replayed);

public sealed record StatusEvidence(string? Name, long Size);
public sealed record StatusPlanItem(string? Id, string? Option);
public sealed record StatusException(string? DecisionNo, string? Content);
public sealed record SuspendCustomerRequest(int BaseVersion, string? ReasonGroup, string? Reason,
    StatusEvidence[]? Evidence, StatusPlanItem[]? Plan, string? CoordinationNote);
public sealed record ReactivateCustomerRequest(int BaseVersion, string? Reason, StatusEvidence[]? Evidence, StatusException? Exception);
public sealed record StatusImpactItem(string Id, string Kind, string KindNote, string Code, string Title, string Detail,
    string StatusLabel, string StatusTone, string Department, string[] Options, string PlanNote);
public sealed record SuspensionReview(StatusImpactItem[] Items, string[] FailedKinds, string? FailedAt = null, string[]? MissingSources = null);
public sealed record ReactivationCheck(string Id, string Label, string Status, string Detail);
public sealed record SuspensionContext(string ReasonGroup, string Reason, StatusEvidence[] Evidence, string DecidedBy,
    string DecidedByTitle, DateTime At, StatusPlanItem[] Plan, string CoordinationNote, object[] Notices);
public sealed record ReactivationContext(SuspensionContext Suspension, ReactivationCheck[] Checks, string? VerifiedBasis,
    bool CanReactivate, string[]? MissingSources = null);
public sealed record StatusChangeResult(CustomerView Customer, bool Replayed);

public sealed class CustomerFailure(int status, string code, object? detail = null) : Exception(code)
{
    public int Status { get; } = status;
    public string Code { get; } = code;
    public object? Detail { get; } = detail;
}
