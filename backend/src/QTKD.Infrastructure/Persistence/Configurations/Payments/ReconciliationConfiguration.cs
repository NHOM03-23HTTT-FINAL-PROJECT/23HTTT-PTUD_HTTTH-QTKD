using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using UserRole = QTKD.Domain.Identity.UserRole;
using UserStatus = QTKD.Domain.Identity.UserStatus;
using SessionEndReason = QTKD.Domain.Identity.SessionEndReason;
using RecordType = QTKD.Domain.Notifications.RecordType;
using SendStatus = QTKD.Domain.Notifications.SendStatus;
using QTKD.Infrastructure.Persistence.Schema;

namespace QTKD.Infrastructure.Persistence.Configurations.Payments;

/// <summary>qtkd.reconciliation. Names follow the original Prisma DDL; CHECKs, triggers and expression indexes live in migration SQL.</summary>
public sealed class ReconciliationConfiguration : IEntityTypeConfiguration<Reconciliation>
{
    public void Configure(EntityTypeBuilder<Reconciliation> b)
    {
        b.ToTable("reconciliation");
        b.HasKey(x => x.ReconciliationId).HasName("reconciliation_pkey");
        b.Property(x => x.ReconciliationId).HasColumnName("reconciliation_id").HasColumnType("uuid").HasDefaultValueSql("gen_random_uuid()");
        b.Property(x => x.StatementId).HasColumnName("statement_id").HasColumnType("uuid");
        b.Property(x => x.VolumeConfirmedBy).HasColumnName("volume_confirmed_by").HasColumnType("uuid");
        b.Property(x => x.VolumeConfirmedAt).HasColumnName("volume_confirmed_at").HasColumnType("timestamp(6) with time zone");
        b.Property(x => x.DiscrepancyNote).HasColumnName("discrepancy_note").HasColumnType("text");
        b.Property(x => x.SentToCustomerAt).HasColumnName("sent_to_customer_at").HasColumnType("timestamp(6) with time zone");
        b.Property(x => x.CustomerResult).HasColumnName("customer_result");
        b.Property(x => x.CustomerFeedback).HasColumnName("customer_feedback").HasColumnType("text");
        b.Property(x => x.ReconciledBy).HasColumnName("reconciled_by").HasColumnType("uuid");
        b.Property(x => x.CompletedAt).HasColumnName("completed_at").HasColumnType("timestamp(6) with time zone");
        b.Property(x => x.PriceConfirmedAt).HasColumnName("price_confirmed_at").HasColumnType("timestamp(6) with time zone");
        b.Property(x => x.PriceMismatchNote).HasColumnName("price_mismatch_note").HasColumnType("text");
        b.HasIndex(x => x.StatementId).IsUnique().HasDatabaseName("reconciliation_statement_id_key");
        b.HasIndex(x => x.VolumeConfirmedBy).HasDatabaseName("reconciliation_volume_confirmed_by_idx");
        b.HasIndex(x => x.ReconciledBy).HasDatabaseName("reconciliation_reconciled_by_idx");
        b.HasOne<PaymentStatement>().WithMany().HasForeignKey(x => x.StatementId)
            .HasConstraintName("reconciliation_statement_id_fkey").OnDelete(DeleteBehavior.Restrict);
        b.HasOne<UserAccount>().WithMany().HasForeignKey(x => x.VolumeConfirmedBy)
            .HasConstraintName("reconciliation_volume_confirmed_by_fkey").OnDelete(DeleteBehavior.Restrict);
        b.HasOne<UserAccount>().WithMany().HasForeignKey(x => x.ReconciledBy)
            .HasConstraintName("reconciliation_reconciled_by_fkey").OnDelete(DeleteBehavior.Restrict);
    }
}
