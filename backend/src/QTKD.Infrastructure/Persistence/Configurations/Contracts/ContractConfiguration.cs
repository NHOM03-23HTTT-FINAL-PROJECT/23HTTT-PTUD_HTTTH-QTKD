using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using UserRole = QTKD.Domain.Identity.UserRole;
using UserStatus = QTKD.Domain.Identity.UserStatus;
using SessionEndReason = QTKD.Domain.Identity.SessionEndReason;
using RecordType = QTKD.Domain.Notifications.RecordType;
using SendStatus = QTKD.Domain.Notifications.SendStatus;
using QTKD.Infrastructure.Persistence.Schema;

namespace QTKD.Infrastructure.Persistence.Configurations.Contracts;

/// <summary>qtkd.contract. Names follow the original Prisma DDL; CHECKs, triggers and expression indexes live in migration SQL.</summary>
public sealed class ContractConfiguration : IEntityTypeConfiguration<Contract>
{
    public void Configure(EntityTypeBuilder<Contract> b)
    {
        b.ToTable("contract");
        b.HasKey(x => x.ContractId).HasName("contract_pkey");
        b.Property(x => x.ContractCode).HasColumnName("contract_code").HasColumnType("character varying(50)").HasDefaultValueSql("('HD-'::text || lpad((nextval('qtkd.contract_code_seq'::regclass))::text, 6, '0'::text))");
        b.Property(x => x.SourceMode).HasColumnName("source_mode").HasColumnType("character varying(20)").HasDefaultValue("blank");
        b.Property(x => x.TemplateCode).HasColumnName("template_code").HasColumnType("character varying(80)");
        b.Property(x => x.CustomerSnapshot).HasColumnName("customer_snapshot").HasColumnType("jsonb").HasDefaultValueSql("'{}'::jsonb");
        b.Property(x => x.OwningDepartmentId).HasColumnName("owning_department_id").HasColumnType("uuid");
        b.Property(x => x.CancelledBy).HasColumnName("cancelled_by").HasColumnType("uuid");
        b.Property(x => x.CancelledAt).HasColumnName("cancelled_at").HasColumnType("timestamp(6) with time zone");
        b.Property(x => x.CancellationReason).HasColumnName("cancellation_reason").HasColumnType("text");
        b.Property(x => x.ContractId).HasColumnName("contract_id").HasColumnType("uuid").HasDefaultValueSql("gen_random_uuid()");
        b.Property(x => x.DocumentType).HasColumnName("document_type").HasDefaultValue(ContractDocumentType.Contract);
        b.Property(x => x.ParentContractId).HasColumnName("parent_contract_id").HasColumnType("uuid");
        b.Property(x => x.CustomerId).HasColumnName("customer_id").HasColumnType("uuid");
        b.Property(x => x.Title).HasColumnName("title").HasColumnType("character varying(500)");
        b.Property(x => x.ContractType).HasColumnName("contract_type").HasColumnType("character varying(100)");
        b.Property(x => x.StartDate).HasColumnName("start_date").HasColumnType("date");
        b.Property(x => x.EndDate).HasColumnName("end_date").HasColumnType("date");
        b.Property(x => x.ContractValue).HasColumnName("contract_value").HasColumnType("numeric(19,2)");
        b.Property(x => x.PaymentTerms).HasColumnName("payment_terms").HasColumnType("text");
        b.Property(x => x.Content).HasColumnName("content").HasColumnType("text");
        b.Property(x => x.Status).HasColumnName("status").HasDefaultValue(ContractStatus.Draft);
        b.Property(x => x.OwnerId).HasColumnName("owner_id").HasColumnType("uuid");
        b.Property(x => x.Version).HasColumnName("version").HasDefaultValue(1);
        b.Property(x => x.CreatedAt).HasColumnName("created_at").HasColumnType("timestamp(6) with time zone").HasDefaultValueSql("CURRENT_TIMESTAMP");
        b.Property(x => x.UpdatedAt).HasColumnName("updated_at").HasColumnType("timestamp(6) with time zone").HasDefaultValueSql("CURRENT_TIMESTAMP");
        b.HasIndex(x => x.ContractCode).IsUnique().HasDatabaseName("contract_contract_code_key");
        b.HasIndex(x => x.ParentContractId).HasDatabaseName("contract_parent_contract_id_idx");
        b.HasIndex(x => x.CustomerId).HasDatabaseName("contract_customer_id_idx");
        b.HasIndex(x => x.OwnerId).HasDatabaseName("contract_owner_id_idx");
        b.HasIndex(x => new { x.Status, x.OwnerId }).HasDatabaseName("contract_status_owner_id_idx");
        b.HasOne<Contract>().WithMany().HasForeignKey(x => x.ParentContractId)
            .HasConstraintName("contract_parent_contract_id_fkey").OnDelete(DeleteBehavior.Restrict);
        b.HasOne<Customer>().WithMany().HasForeignKey(x => x.CustomerId)
            .HasConstraintName("contract_customer_id_fkey").OnDelete(DeleteBehavior.Restrict);
        b.HasOne<UserAccount>().WithMany().HasForeignKey(x => x.OwnerId)
            .HasConstraintName("contract_owner_id_fkey").OnDelete(DeleteBehavior.Restrict);
        // Added by raw SQL in 202611020004_contracts (not in the Prisma schema), hence the "_fk" names.
        b.HasOne<Department>().WithMany().HasForeignKey(x => x.OwningDepartmentId)
            .HasConstraintName("contract_department_fk").OnDelete(DeleteBehavior.Restrict);
        b.HasOne<UserAccount>().WithMany().HasForeignKey(x => x.CancelledBy)
            .HasConstraintName("contract_cancelled_by_fk").OnDelete(DeleteBehavior.Restrict);
    }
}
