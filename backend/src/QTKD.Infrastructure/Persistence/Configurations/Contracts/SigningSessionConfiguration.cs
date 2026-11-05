using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using UserRole = QTKD.Domain.Identity.UserRole;
using UserStatus = QTKD.Domain.Identity.UserStatus;
using SessionEndReason = QTKD.Domain.Identity.SessionEndReason;
using RecordType = QTKD.Domain.Notifications.RecordType;
using SendStatus = QTKD.Domain.Notifications.SendStatus;
using QTKD.Infrastructure.Persistence.Schema;

namespace QTKD.Infrastructure.Persistence.Configurations.Contracts;

/// <summary>qtkd.signing_session. Names follow the original Prisma DDL; CHECKs, triggers and expression indexes live in migration SQL.</summary>
public sealed class SigningSessionConfiguration : IEntityTypeConfiguration<SigningSession>
{
    public void Configure(EntityTypeBuilder<SigningSession> b)
    {
        b.ToTable("signing_session");
        b.HasKey(x => x.SigningSessionId).HasName("signing_session_pkey");
        b.Property(x => x.SigningSessionId).HasColumnName("signing_session_id").HasColumnType("uuid").HasDefaultValueSql("gen_random_uuid()");
        b.Property(x => x.RecordType).HasColumnName("record_type");
        b.Property(x => x.ContractId).HasColumnName("contract_id").HasColumnType("uuid");
        b.Property(x => x.StatementId).HasColumnName("statement_id").HasColumnType("uuid");
        b.Property(x => x.ProviderSessionId).HasColumnName("provider_session_id").HasColumnType("character varying(200)");
        b.Property(x => x.Status).HasColumnName("status").HasDefaultValue(SigningStatus.Signing);
        b.Property(x => x.Reason).HasColumnName("reason").HasColumnType("text");
        b.Property(x => x.CompanySignerId).HasColumnName("company_signer_id").HasColumnType("uuid");
        b.Property(x => x.CompanySignedAt).HasColumnName("company_signed_at").HasColumnType("timestamp(6) with time zone");
        b.Property(x => x.CustomerSignerName).HasColumnName("customer_signer_name").HasColumnType("character varying(200)");
        b.Property(x => x.CustomerSignerEmail).HasColumnName("customer_signer_email").HasColumnType("character varying(254)");
        b.Property(x => x.CustomerSignedAt).HasColumnName("customer_signed_at").HasColumnType("timestamp(6) with time zone");
        b.Property(x => x.SignedFileId).HasColumnName("signed_file_id").HasColumnType("uuid");
        b.Property(x => x.SentBy).HasColumnName("sent_by").HasColumnType("uuid");
        b.Property(x => x.SentAt).HasColumnName("sent_at").HasColumnType("timestamp(6) with time zone").HasDefaultValueSql("CURRENT_TIMESTAMP");
        b.Property(x => x.ResultAt).HasColumnName("result_at").HasColumnType("timestamp(6) with time zone");
        b.HasIndex(x => x.ProviderSessionId).IsUnique().HasDatabaseName("signing_session_provider_session_id_key");
        b.HasIndex(x => x.ContractId).HasDatabaseName("signing_session_contract_id_idx");
        b.HasIndex(x => x.StatementId).HasDatabaseName("signing_session_statement_id_idx");
        b.HasIndex(x => x.CompanySignerId).HasDatabaseName("signing_session_company_signer_id_idx");
        b.HasIndex(x => x.SignedFileId).HasDatabaseName("signing_session_signed_file_id_idx");
        b.HasIndex(x => x.SentBy).HasDatabaseName("signing_session_sent_by_idx");
        b.HasOne<Contract>().WithMany().HasForeignKey(x => x.ContractId)
            .HasConstraintName("signing_session_contract_id_fkey").OnDelete(DeleteBehavior.Restrict);
        b.HasOne<PaymentStatement>().WithMany().HasForeignKey(x => x.StatementId)
            .HasConstraintName("signing_session_statement_id_fkey").OnDelete(DeleteBehavior.Restrict);
        b.HasOne<UserAccount>().WithMany().HasForeignKey(x => x.CompanySignerId)
            .HasConstraintName("signing_session_company_signer_id_fkey").OnDelete(DeleteBehavior.Restrict);
        b.HasOne<Attachment>().WithMany().HasForeignKey(x => x.SignedFileId)
            .HasConstraintName("signing_session_signed_file_id_fkey").OnDelete(DeleteBehavior.Restrict);
        b.HasOne<UserAccount>().WithMany().HasForeignKey(x => x.SentBy)
            .HasConstraintName("signing_session_sent_by_fkey").OnDelete(DeleteBehavior.Restrict);
    }
}
