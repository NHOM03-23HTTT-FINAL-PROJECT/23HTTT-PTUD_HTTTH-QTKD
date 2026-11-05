using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using UserRole = QTKD.Domain.Identity.UserRole;
using UserStatus = QTKD.Domain.Identity.UserStatus;
using SessionEndReason = QTKD.Domain.Identity.SessionEndReason;
using RecordType = QTKD.Domain.Notifications.RecordType;
using SendStatus = QTKD.Domain.Notifications.SendStatus;
using QTKD.Infrastructure.Persistence.Schema;

namespace QTKD.Infrastructure.Persistence.Configurations.Payments;

/// <summary>qtkd.payment_statement_line. Names follow the original Prisma DDL; CHECKs, triggers and expression indexes live in migration SQL.</summary>
public sealed class PaymentStatementLineConfiguration : IEntityTypeConfiguration<PaymentStatementLine>
{
    public void Configure(EntityTypeBuilder<PaymentStatementLine> b)
    {
        b.ToTable("payment_statement_line");
        b.HasKey(x => x.LineId).HasName("payment_statement_line_pkey");
        b.Property(x => x.LineId).HasColumnName("line_id").HasColumnType("uuid").HasDefaultValueSql("gen_random_uuid()");
        b.Property(x => x.StatementId).HasColumnName("statement_id").HasColumnType("uuid");
        b.Property(x => x.PriceListLineId).HasColumnName("price_list_line_id").HasColumnType("uuid");
        b.Property(x => x.VolumeLineId).HasColumnName("volume_line_id").HasColumnType("uuid");
        b.Property(x => x.Quantity).HasColumnName("quantity").HasColumnType("numeric(19,4)");
        b.Property(x => x.UnitPrice).HasColumnName("unit_price").HasColumnType("numeric(19,2)");
        b.Property(x => x.Amount).HasColumnName("amount").HasColumnType("numeric(19,2)");
        b.Property(x => x.IsMandatory).HasColumnName("is_mandatory").HasDefaultValue(false);
        b.HasIndex(x => x.StatementId).HasDatabaseName("payment_statement_line_statement_id_idx");
        b.HasIndex(x => x.PriceListLineId).HasDatabaseName("payment_statement_line_price_list_line_id_idx");
        b.HasIndex(x => x.VolumeLineId).HasDatabaseName("payment_statement_line_volume_line_id_idx");
        b.HasOne<PaymentStatement>().WithMany().HasForeignKey(x => x.StatementId)
            .HasConstraintName("payment_statement_line_statement_id_fkey").OnDelete(DeleteBehavior.Restrict);
        b.HasOne<PriceListLine>().WithMany().HasForeignKey(x => x.PriceListLineId)
            .HasConstraintName("payment_statement_line_price_list_line_id_fkey").OnDelete(DeleteBehavior.Restrict);
        b.HasOne<VolumeLine>().WithMany().HasForeignKey(x => x.VolumeLineId)
            .HasConstraintName("payment_statement_line_volume_line_id_fkey").OnDelete(DeleteBehavior.Restrict);
    }
}
