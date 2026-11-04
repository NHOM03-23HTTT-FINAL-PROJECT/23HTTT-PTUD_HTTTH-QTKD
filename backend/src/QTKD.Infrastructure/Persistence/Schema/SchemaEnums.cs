namespace QTKD.Infrastructure.Persistence.Schema;

// PostgreSQL enums of schema qtkd. Value names must equal the database labels.
// user_role, user_status, session_end_reason, record_type and send_status reuse the Domain enums.

/// <summary>qtkd.document_record_type</summary>
public enum DocumentRecordType { Contract, PaymentStatement }

/// <summary>qtkd.active_status</summary>
public enum ActiveStatus { Active, Suspended }

/// <summary>qtkd.customer_decision_type</summary>
public enum CustomerDecisionType { Suspend, Reactivate }

/// <summary>qtkd.contract_document_type</summary>
public enum ContractDocumentType { Contract, Appendix, CancellationAgreement, TerminationRecord }

/// <summary>qtkd.contract_status</summary>
public enum ContractStatus { Draft, Submitted, UnderReview, RevisionRequested, Rejected, Approved, Cancelled, Active }

/// <summary>qtkd.price_list_status</summary>
public enum PriceListStatus { Draft, Approved, Effective, Expired }

/// <summary>qtkd.volume_status</summary>
public enum VolumeStatus { Draft, Confirmed, Locked }

/// <summary>qtkd.payment_status</summary>
public enum PaymentStatus { Draft, Calculated, Reconciled, Submitted, Approved, Signing, Signed, Issued, Rejected, Revision, Cancelled }

/// <summary>qtkd.customer_result</summary>
public enum CustomerResult { Agreed, Disagreed }

/// <summary>qtkd.change_request_type</summary>
public enum ChangeRequestType { Revision, Cancellation, Withdrawal }

/// <summary>qtkd.change_request_status</summary>
public enum ChangeRequestStatus { Pending, Approved, Rejected }

/// <summary>qtkd.approval_result</summary>
public enum ApprovalResult { Running, Completed, RevisionRequested, Rejected, Withdrawn }

/// <summary>qtkd.approval_step_status</summary>
public enum ApprovalStepStatus { NotStarted, Pending, Reviewing, Completed, Skipped }

/// <summary>qtkd.approval_decision</summary>
public enum ApprovalDecision { Approve, RequestRevision, Reject }

/// <summary>qtkd.signing_status</summary>
public enum SigningStatus { Signing, Succeeded, Failed, Cancelled }
