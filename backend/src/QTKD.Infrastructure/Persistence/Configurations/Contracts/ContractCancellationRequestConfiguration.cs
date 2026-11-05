using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using UserRole = QTKD.Domain.Identity.UserRole;
using UserStatus = QTKD.Domain.Identity.UserStatus;
using SessionEndReason = QTKD.Domain.Identity.SessionEndReason;
using RecordType = QTKD.Domain.Notifications.RecordType;
using SendStatus = QTKD.Domain.Notifications.SendStatus;
using QTKD.Infrastructure.Persistence.Schema;

namespace QTKD.Infrastructure.Persistence.Configurations.Contracts;

/// <summary>qtkd.contract_cancellation_request. Names follow the original Prisma DDL; CHECKs, triggers and expression indexes live in migration SQL.</summary>
public sealed class ContractCancellationRequestConfiguration : IEntityTypeConfiguration<ContractCancellationRequest>
{
    public void Configure(EntityTypeBuilder<ContractCancellationRequest> b)
    {
        b.ToTable("contract_cancellation_request");
        b.HasKey(x => x.RequestId).HasName("contract_cancellation_request_pkey");
        b.Property(x => x.RequestId).HasColumnName("request_id").HasColumnType("uuid").HasDefaultValueSql("gen_random_uuid()");
        b.Property(x => x.ContractId).HasColumnName("contract_id").HasColumnType("uuid");
        b.Property(x => x.RequestedBy).HasColumnName("requested_by").HasColumnType("uuid");
        b.Property(x => x.RequestedAt).HasColumnName("requested_at").HasColumnType("timestamp(6) with time zone").HasDefaultValueSql("CURRENT_TIMESTAMP");
        b.Property(x => x.Party).HasColumnName("party").HasColumnType("character varying(20)");
        b.Property(x => x.Reason).HasColumnName("reason").HasColumnType("text");
        b.Property(x => x.OriginalStatus).HasColumnName("original_status");
        b.Property(x => x.ContractVersion).HasColumnName("contract_version");
        b.Property(x => x.Status).HasColumnName("status").HasColumnType("character varying(30)").HasDefaultValue("pending-sales");
        b.Property(x => x.SalesAssigneeId).HasColumnName("sales_assignee_id").HasColumnType("uuid");
        b.Property(x => x.SalesDecidedAt).HasColumnName("sales_decided_at").HasColumnType("timestamp(6) with time zone");
        b.Property(x => x.SalesApproved).HasColumnName("sales_approved");
        b.Property(x => x.SalesReason).HasColumnName("sales_reason").HasColumnType("text");
        b.Property(x => x.BoardAssigneeId).HasColumnName("board_assignee_id").HasColumnType("uuid");
        b.Property(x => x.BoardDecidedAt).HasColumnName("board_decided_at").HasColumnType("timestamp(6) with time zone");
        b.Property(x => x.BoardApproved).HasColumnName("board_approved");
        b.Property(x => x.BoardReason).HasColumnName("board_reason").HasColumnType("text");
        b.Property(x => x.Version).HasColumnName("version").HasDefaultValue(1);
        b.HasIndex(x => x.ContractId).HasDatabaseName("contract_cancellation_request_contract_id_idx");
        b.HasOne<Contract>().WithMany().HasForeignKey(x => x.ContractId)
            .HasConstraintName("contract_cancellation_request_contract_id_fkey").OnDelete(DeleteBehavior.Restrict);
        b.HasOne<UserAccount>().WithMany().HasForeignKey(x => x.RequestedBy)
            .HasConstraintName("contract_cancellation_request_requested_by_fkey").OnDelete(DeleteBehavior.Restrict);
        b.HasOne<UserAccount>().WithMany().HasForeignKey(x => x.SalesAssigneeId)
            .HasConstraintName("contract_cancellation_request_sales_assignee_id_fkey").OnDelete(DeleteBehavior.Restrict);
        b.HasOne<UserAccount>().WithMany().HasForeignKey(x => x.BoardAssigneeId)
            .HasConstraintName("contract_cancellation_request_board_assignee_id_fkey").OnDelete(DeleteBehavior.Restrict);
    }
}
