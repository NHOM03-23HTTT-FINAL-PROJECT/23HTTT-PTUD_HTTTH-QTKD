using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using UserRole = QTKD.Domain.Identity.UserRole;
using UserStatus = QTKD.Domain.Identity.UserStatus;
using SessionEndReason = QTKD.Domain.Identity.SessionEndReason;
using RecordType = QTKD.Domain.Notifications.RecordType;
using SendStatus = QTKD.Domain.Notifications.SendStatus;
using QTKD.Infrastructure.Persistence.Schema;

namespace QTKD.Infrastructure.Persistence.Configurations.Contracts;

/// <summary>qtkd.change_request. Names follow the original Prisma DDL; CHECKs, triggers and expression indexes live in migration SQL.</summary>
public sealed class ChangeRequestConfiguration : IEntityTypeConfiguration<ChangeRequest>
{
    public void Configure(EntityTypeBuilder<ChangeRequest> b)
    {
        b.ToTable("change_request");
        b.HasKey(x => x.RequestId).HasName("change_request_pkey");
        b.Property(x => x.RequestId).HasColumnName("request_id").HasColumnType("uuid").HasDefaultValueSql("gen_random_uuid()");
        b.Property(x => x.RequestType).HasColumnName("request_type");
        b.Property(x => x.RecordType).HasColumnName("record_type");
        b.Property(x => x.ContractId).HasColumnName("contract_id").HasColumnType("uuid");
        b.Property(x => x.StatementId).HasColumnName("statement_id").HasColumnType("uuid");
        b.Property(x => x.Reason).HasColumnName("reason").HasColumnType("text");
        b.Property(x => x.Status).HasColumnName("status").HasDefaultValue(ChangeRequestStatus.Pending);
        b.Property(x => x.RequestedBy).HasColumnName("requested_by").HasColumnType("uuid");
        b.Property(x => x.RequestedAt).HasColumnName("requested_at").HasColumnType("timestamp(6) with time zone").HasDefaultValueSql("CURRENT_TIMESTAMP");
        b.Property(x => x.ApprovedBy).HasColumnName("approved_by").HasColumnType("uuid");
        b.Property(x => x.ApproverComment).HasColumnName("approver_comment").HasColumnType("text");
        b.Property(x => x.DecidedAt).HasColumnName("decided_at").HasColumnType("timestamp(6) with time zone");
        b.HasIndex(x => x.ContractId).HasDatabaseName("change_request_contract_id_idx");
        b.HasIndex(x => x.StatementId).HasDatabaseName("change_request_statement_id_idx");
        b.HasIndex(x => x.RequestedBy).HasDatabaseName("change_request_requested_by_idx");
        b.HasIndex(x => x.ApprovedBy).HasDatabaseName("change_request_approved_by_idx");
        b.HasOne<Contract>().WithMany().HasForeignKey(x => x.ContractId)
            .HasConstraintName("change_request_contract_id_fkey").OnDelete(DeleteBehavior.Restrict);
        b.HasOne<PaymentStatement>().WithMany().HasForeignKey(x => x.StatementId)
            .HasConstraintName("change_request_statement_id_fkey").OnDelete(DeleteBehavior.Restrict);
        b.HasOne<UserAccount>().WithMany().HasForeignKey(x => x.RequestedBy)
            .HasConstraintName("change_request_requested_by_fkey").OnDelete(DeleteBehavior.Restrict);
        b.HasOne<UserAccount>().WithMany().HasForeignKey(x => x.ApprovedBy)
            .HasConstraintName("change_request_approved_by_fkey").OnDelete(DeleteBehavior.Restrict);
    }
}
