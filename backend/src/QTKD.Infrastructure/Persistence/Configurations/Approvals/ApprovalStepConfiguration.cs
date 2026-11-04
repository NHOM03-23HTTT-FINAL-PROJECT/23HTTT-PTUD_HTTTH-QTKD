using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using UserRole = QTKD.Domain.Identity.UserRole;
using UserStatus = QTKD.Domain.Identity.UserStatus;
using SessionEndReason = QTKD.Domain.Identity.SessionEndReason;
using RecordType = QTKD.Domain.Notifications.RecordType;
using SendStatus = QTKD.Domain.Notifications.SendStatus;
using QTKD.Infrastructure.Persistence.Schema;

namespace QTKD.Infrastructure.Persistence.Configurations.Approvals;

/// <summary>qtkd.approval_step. Names follow the original Prisma DDL; CHECKs, triggers and expression indexes live in migration SQL.</summary>
public sealed class ApprovalStepConfiguration : IEntityTypeConfiguration<ApprovalStep>
{
    public void Configure(EntityTypeBuilder<ApprovalStep> b)
    {
        b.ToTable("approval_step");
        b.HasKey(x => x.StepId).HasName("approval_step_pkey");
        b.Property(x => x.StepId).HasColumnName("step_id").HasColumnType("uuid").HasDefaultValueSql("gen_random_uuid()");
        b.Property(x => x.RoundId).HasColumnName("round_id").HasColumnType("uuid");
        b.Property(x => x.StepName).HasColumnName("step_name").HasColumnType("character varying(200)");
        b.Property(x => x.StepOrder).HasColumnName("step_order");
        b.Property(x => x.AssigneeId).HasColumnName("assignee_id").HasColumnType("uuid");
        b.Property(x => x.AssignedAt).HasColumnName("assigned_at").HasColumnType("timestamp(6) with time zone");
        b.Property(x => x.AcceptedAt).HasColumnName("accepted_at").HasColumnType("timestamp(6) with time zone");
        b.Property(x => x.StepStatus).HasColumnName("step_status").HasDefaultValue(ApprovalStepStatus.NotStarted);
        b.Property(x => x.Decision).HasColumnName("decision");
        b.Property(x => x.Comment).HasColumnName("comment").HasColumnType("text");
        b.Property(x => x.LegalConclusion).HasColumnName("legal_conclusion").HasColumnType("text");
        b.Property(x => x.DecidedBy).HasColumnName("decided_by").HasColumnType("uuid");
        b.Property(x => x.DecidedAt).HasColumnName("decided_at").HasColumnType("timestamp(6) with time zone");
        b.HasIndex(x => new { x.RoundId, x.StepOrder }).IsUnique().HasDatabaseName("approval_step_round_id_step_order_key");
        b.HasIndex(x => x.RoundId).HasDatabaseName("approval_step_round_id_idx");
        b.HasIndex(x => x.AssigneeId).HasDatabaseName("approval_step_assignee_id_idx");
        b.HasIndex(x => x.DecidedBy).HasDatabaseName("approval_step_decided_by_idx");
        b.HasOne<ApprovalRound>().WithMany().HasForeignKey(x => x.RoundId)
            .HasConstraintName("approval_step_round_id_fkey").OnDelete(DeleteBehavior.Restrict);
        b.HasOne<UserAccount>().WithMany().HasForeignKey(x => x.AssigneeId)
            .HasConstraintName("approval_step_assignee_id_fkey").OnDelete(DeleteBehavior.Restrict);
        b.HasOne<UserAccount>().WithMany().HasForeignKey(x => x.DecidedBy)
            .HasConstraintName("approval_step_decided_by_fkey").OnDelete(DeleteBehavior.Restrict);
    }
}
