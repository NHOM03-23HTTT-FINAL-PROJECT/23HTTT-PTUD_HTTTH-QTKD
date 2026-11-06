using QTKD.Domain.Identity;

namespace QTKD.Domain.Customers;

// Persistence-neutral records, following the ContractRecord pattern used by main.
public sealed record CustomerActor(Guid Id, Guid DepartmentId, UserRole Role, string Name);
public sealed record CustomerRecord(Guid Id, string Name, string TaxCode, string Address, string Representative,
    string ContactName, string ContactTitle, string Phone, string Email, string Group, string[] Services,
    string Status, Guid OwnerId, string OwnerName, int Version, DateTime? CreatedAt, string? CreatedBy,
    DateTime? UpdatedAt, string Code, string? LegacyInterestedServices);
public sealed record CustomerValues(string Name, string TaxCode, string Address, string Representative,
    string ContactName, string ContactTitle, string Phone, string Email, string Group, string[] Services);
public sealed record CustomerReceipt(Guid CustomerId, string Hash, string Response);
public sealed record CustomerInsert(Guid? Id, CustomerRecord? Duplicate);
public sealed record CustomerDecision(string Type, string Reason, string? Basis, string? Plan, string By, DateTime At, string? Metadata);
public sealed record CustomerDelegatePerson(Guid Id, string Name, string Username);
public sealed record CustomerDelegation(Guid Id, Guid GranteeId, string GranteeName, string Username,
    string Action, string? Reason, string GrantedBy, DateTime GrantedAt, DateTime? ExpiresAt, DateTime? RevokedAt,
    string? RevokedBy, bool Eligible);
public sealed record CustomerRelatedContract(Guid Id, string Code, string Title, string Status, int Version, bool Visible);
public sealed record CustomerRelatedApproval(Guid Id, Guid ContractId, int RoundNo, int Version, string Result);
public sealed record CustomerSuspensionSnapshot(CustomerRelatedContract[] Contracts, CustomerRelatedApproval[] Approvals,
    bool HasPaymentApprovals);
