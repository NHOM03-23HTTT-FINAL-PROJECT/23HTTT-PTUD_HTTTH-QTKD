using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using UserRole = QTKD.Domain.Identity.UserRole;
using UserStatus = QTKD.Domain.Identity.UserStatus;
using SessionEndReason = QTKD.Domain.Identity.SessionEndReason;
using RecordType = QTKD.Domain.Notifications.RecordType;
using SendStatus = QTKD.Domain.Notifications.SendStatus;
using QTKD.Infrastructure.Persistence.Schema;

namespace QTKD.Infrastructure.Persistence.Configurations.Payments;

/// <summary>qtkd.payment_statement. Names follow the original Prisma DDL; CHECKs, triggers and expression indexes live in migration SQL.</summary>
public sealed class PaymentStatementConfiguration : IEntityTypeConfiguration<PaymentStatement>
{
    public void Configure(EntityTypeBuilder<PaymentStatement> b)
    {
        b.ToTable("payment_statement");
        b.HasKey(x => x.StatementId).HasName("payment_statement_pkey");
        b.Property(x => x.StatementId).HasColumnName("statement_id").HasColumnType("uuid").HasDefaultValueSql("gen_random_uuid()");
        b.Property(x => x.ContractId).HasColumnName("contract_id").HasColumnType("uuid");
        b.Property(x => x.BillingPeriod).HasColumnName("billing_period").HasColumnType("character varying(7)");
        b.Property(x => x.PriceListId).HasColumnName("price_list_id").HasColumnType("uuid");
        b.Property(x => x.VolumePeriodId).HasColumnName("volume_period_id").HasColumnType("uuid");
        b.Property(x => x.CustomerNameSnapshot).HasColumnName("customer_name_snapshot").HasColumnType("character varying(250)");
        b.Property(x => x.TaxCodeSnapshot).HasColumnName("tax_code_snapshot").HasColumnType("character varying(13)");
        b.Property(x => x.AddressSnapshot).HasColumnName("address_snapshot").HasColumnType("text");
        b.Property(x => x.RepresentativeSnapshot).HasColumnName("representative_snapshot").HasColumnType("character varying(200)");
        b.Property(x => x.Subtotal).HasColumnName("subtotal").HasColumnType("numeric(19,2)");
        b.Property(x => x.TaxAmount).HasColumnName("tax_amount").HasColumnType("numeric(19,2)");
        b.Property(x => x.TotalAmount).HasColumnName("total_amount").HasColumnType("numeric(19,2)");
        b.Property(x => x.Status).HasColumnName("status").HasDefaultValue(PaymentStatus.Draft);
        b.Property(x => x.OriginalStatementId).HasColumnName("original_statement_id").HasColumnType("uuid");
        b.Property(x => x.CreatedBy).HasColumnName("created_by").HasColumnType("uuid");
        b.Property(x => x.CreatedAt).HasColumnName("created_at").HasColumnType("timestamp(6) with time zone").HasDefaultValueSql("CURRENT_TIMESTAMP");
        b.Property(x => x.IssuedAt).HasColumnName("issued_at").HasColumnType("timestamp(6) with time zone");
        b.Property(x => x.IsLocked).HasColumnName("is_locked").HasDefaultValue(false);
        b.HasIndex(x => x.ContractId).HasDatabaseName("payment_statement_contract_id_idx");
        b.HasIndex(x => x.PriceListId).HasDatabaseName("payment_statement_price_list_id_idx");
        b.HasIndex(x => x.VolumePeriodId).HasDatabaseName("payment_statement_volume_period_id_idx");
        b.HasIndex(x => x.OriginalStatementId).HasDatabaseName("payment_statement_original_statement_id_idx");
        b.HasIndex(x => x.CreatedBy).HasDatabaseName("payment_statement_created_by_idx");
        b.HasOne<Contract>().WithMany().HasForeignKey(x => x.ContractId)
            .HasConstraintName("payment_statement_contract_id_fkey").OnDelete(DeleteBehavior.Restrict);
        b.HasOne<PriceList>().WithMany().HasForeignKey(x => x.PriceListId)
            .HasConstraintName("payment_statement_price_list_id_fkey").OnDelete(DeleteBehavior.Restrict);
        b.HasOne<VolumePeriod>().WithMany().HasForeignKey(x => x.VolumePeriodId)
            .HasConstraintName("payment_statement_volume_period_id_fkey").OnDelete(DeleteBehavior.Restrict);
        b.HasOne<PaymentStatement>().WithMany().HasForeignKey(x => x.OriginalStatementId)
            .HasConstraintName("payment_statement_original_statement_id_fkey").OnDelete(DeleteBehavior.Restrict);
        b.HasOne<UserAccount>().WithMany().HasForeignKey(x => x.CreatedBy)
            .HasConstraintName("payment_statement_created_by_fkey").OnDelete(DeleteBehavior.Restrict);
    }
}
