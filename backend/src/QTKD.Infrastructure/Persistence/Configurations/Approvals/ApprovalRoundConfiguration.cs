using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using UserRole = QTKD.Domain.Identity.UserRole;
using UserStatus = QTKD.Domain.Identity.UserStatus;
using SessionEndReason = QTKD.Domain.Identity.SessionEndReason;
using RecordType = QTKD.Domain.Notifications.RecordType;
using SendStatus = QTKD.Domain.Notifications.SendStatus;
using QTKD.Infrastructure.Persistence.Schema;

namespace QTKD.Infrastructure.Persistence.Configurations.Approvals;

/// <summary>qtkd.approval_round. Names follow the original Prisma DDL; CHECKs, triggers and expression indexes live in migration SQL.</summary>
public sealed class ApprovalRoundConfiguration : IEntityTypeConfiguration<ApprovalRound>
{
    public void Configure(EntityTypeBuilder<ApprovalRound> b)
    {
        b.ToTable("approval_round");
        b.HasKey(x => x.RoundId).HasName("approval_round_pkey");
        b.Property(x => x.RoundId).HasColumnName("round_id").HasColumnType("uuid").HasDefaultValueSql("gen_random_uuid()");
        b.Property(x => x.RecordType).HasColumnName("record_type");
        b.Property(x => x.ContractId).HasColumnName("contract_id").HasColumnType("uuid");
        b.Property(x => x.StatementId).HasColumnName("statement_id").HasColumnType("uuid");
        b.Property(x => x.RecordVersion).HasColumnName("record_version");
        b.Property(x => x.RoundNo).HasColumnName("round_no");
        b.Property(x => x.SubmittedBy).HasColumnName("submitted_by").HasColumnType("uuid");
        b.Property(x => x.SubmittedAt).HasColumnName("submitted_at").HasColumnType("timestamp(6) with time zone").HasDefaultValueSql("CURRENT_TIMESTAMP");
        b.Property(x => x.Result).HasColumnName("result").HasDefaultValue(ApprovalResult.Running);
        b.Property(x => x.EndedAt).HasColumnName("ended_at").HasColumnType("timestamp(6) with time zone");
        b.Property(x => x.RecordSnapshot).HasColumnName("record_snapshot").HasColumnType("jsonb");
        b.HasIndex(x => new { x.ContractId, x.RoundNo }).IsUnique().HasDatabaseName("approval_round_contract_id_round_no_key");
        b.HasIndex(x => new { x.StatementId, x.RoundNo }).IsUnique().HasDatabaseName("approval_round_statement_id_round_no_key");
        b.HasIndex(x => x.ContractId).HasDatabaseName("approval_round_contract_id_idx");
        b.HasIndex(x => x.StatementId).HasDatabaseName("approval_round_statement_id_idx");
        b.HasIndex(x => x.SubmittedBy).HasDatabaseName("approval_round_submitted_by_idx");
        b.HasOne<Contract>().WithMany().HasForeignKey(x => x.ContractId)
            .HasConstraintName("approval_round_contract_id_fkey").OnDelete(DeleteBehavior.Restrict);
        b.HasOne<PaymentStatement>().WithMany().HasForeignKey(x => x.StatementId)
            .HasConstraintName("approval_round_statement_id_fkey").OnDelete(DeleteBehavior.Restrict);
        b.HasOne<UserAccount>().WithMany().HasForeignKey(x => x.SubmittedBy)
            .HasConstraintName("approval_round_submitted_by_fkey").OnDelete(DeleteBehavior.Restrict);
    }
}
