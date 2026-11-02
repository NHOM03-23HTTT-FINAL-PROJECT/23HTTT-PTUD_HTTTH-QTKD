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

public sealed class CustomerFailure(int status, string code, object? detail = null) : Exception(code)
{
    public int Status { get; } = status;
    public string Code { get; } = code;
    public object? Detail { get; } = detail;
}
