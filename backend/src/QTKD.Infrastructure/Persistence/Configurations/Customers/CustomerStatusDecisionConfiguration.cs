using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using UserRole = QTKD.Domain.Identity.UserRole;
using UserStatus = QTKD.Domain.Identity.UserStatus;
using SessionEndReason = QTKD.Domain.Identity.SessionEndReason;
using RecordType = QTKD.Domain.Notifications.RecordType;
using SendStatus = QTKD.Domain.Notifications.SendStatus;
using QTKD.Infrastructure.Persistence.Schema;

namespace QTKD.Infrastructure.Persistence.Configurations.Customers;

/// <summary>qtkd.customer_status_decision. Names follow the original Prisma DDL; CHECKs, triggers and expression indexes live in migration SQL.</summary>
public sealed class CustomerStatusDecisionConfiguration : IEntityTypeConfiguration<CustomerStatusDecision>
{
    public void Configure(EntityTypeBuilder<CustomerStatusDecision> b)
    {
        b.ToTable("customer_status_decision");
        b.HasKey(x => x.DecisionId).HasName("customer_status_decision_pkey");
        b.Property(x => x.DecisionId).HasColumnName("decision_id").HasColumnType("uuid").HasDefaultValueSql("gen_random_uuid()");
        b.Property(x => x.CustomerId).HasColumnName("customer_id").HasColumnType("uuid");
        b.Property(x => x.DecisionType).HasColumnName("decision_type");
        b.Property(x => x.Reason).HasColumnName("reason").HasColumnType("text");
        b.Property(x => x.Basis).HasColumnName("basis").HasColumnType("text");
        b.Property(x => x.FollowUpPlan).HasColumnName("follow_up_plan").HasColumnType("text");
        b.Property(x => x.ConfirmedBy).HasColumnName("confirmed_by").HasColumnType("uuid");
        b.Property(x => x.DecidedAt).HasColumnName("decided_at").HasColumnType("timestamp(6) with time zone").HasDefaultValueSql("CURRENT_TIMESTAMP");
        b.HasIndex(x => x.CustomerId).HasDatabaseName("customer_status_decision_customer_id_idx");
        b.HasIndex(x => x.ConfirmedBy).HasDatabaseName("customer_status_decision_confirmed_by_idx");
        b.HasOne<Customer>().WithMany().HasForeignKey(x => x.CustomerId)
            .HasConstraintName("customer_status_decision_customer_id_fkey").OnDelete(DeleteBehavior.Restrict);
        b.HasOne<UserAccount>().WithMany().HasForeignKey(x => x.ConfirmedBy)
            .HasConstraintName("customer_status_decision_confirmed_by_fkey").OnDelete(DeleteBehavior.Restrict);
    }
}
