using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using UserRole = QTKD.Domain.Identity.UserRole;
using UserStatus = QTKD.Domain.Identity.UserStatus;
using SessionEndReason = QTKD.Domain.Identity.SessionEndReason;
using RecordType = QTKD.Domain.Notifications.RecordType;
using SendStatus = QTKD.Domain.Notifications.SendStatus;
using QTKD.Infrastructure.Persistence.Schema;

namespace QTKD.Infrastructure.Persistence.Configurations.Contracts;

/// <summary>qtkd.attachment. Names follow the original Prisma DDL; CHECKs, triggers and expression indexes live in migration SQL.</summary>
public sealed class AttachmentConfiguration : IEntityTypeConfiguration<Attachment>
{
    public void Configure(EntityTypeBuilder<Attachment> b)
    {
        b.ToTable("attachment");
        b.HasKey(x => x.AttachmentId).HasName("attachment_pkey");
        b.Property(x => x.FileSize).HasColumnName("file_size").HasDefaultValue(0);
        b.Property(x => x.ContentType).HasColumnName("content_type").HasColumnType("character varying(200)").HasDefaultValue("application/octet-stream");
        b.Property(x => x.AttachmentId).HasColumnName("attachment_id").HasColumnType("uuid").HasDefaultValueSql("gen_random_uuid()");
        b.Property(x => x.RecordType).HasColumnName("record_type");
        b.Property(x => x.ContractId).HasColumnName("contract_id").HasColumnType("uuid");
        b.Property(x => x.StatementId).HasColumnName("statement_id").HasColumnType("uuid");
        b.Property(x => x.FileName).HasColumnName("file_name").HasColumnType("character varying(255)");
        b.Property(x => x.FilePath).HasColumnName("file_path").HasColumnType("text");
        b.Property(x => x.UploadedBy).HasColumnName("uploaded_by").HasColumnType("uuid");
        b.Property(x => x.UploadedAt).HasColumnName("uploaded_at").HasColumnType("timestamp(6) with time zone").HasDefaultValueSql("CURRENT_TIMESTAMP");
        b.HasIndex(x => x.ContractId).HasDatabaseName("attachment_contract_id_idx");
        b.HasIndex(x => x.StatementId).HasDatabaseName("attachment_statement_id_idx");
        b.HasIndex(x => x.UploadedBy).HasDatabaseName("attachment_uploaded_by_idx");
        b.HasOne<Contract>().WithMany().HasForeignKey(x => x.ContractId)
            .HasConstraintName("attachment_contract_id_fkey").OnDelete(DeleteBehavior.Restrict);
        b.HasOne<PaymentStatement>().WithMany().HasForeignKey(x => x.StatementId)
            .HasConstraintName("attachment_statement_id_fkey").OnDelete(DeleteBehavior.Restrict);
        b.HasOne<UserAccount>().WithMany().HasForeignKey(x => x.UploadedBy)
            .HasConstraintName("attachment_uploaded_by_fkey").OnDelete(DeleteBehavior.Restrict);
    }
}
