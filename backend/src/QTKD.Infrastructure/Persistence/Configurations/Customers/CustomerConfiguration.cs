using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using UserRole = QTKD.Domain.Identity.UserRole;
using UserStatus = QTKD.Domain.Identity.UserStatus;
using SessionEndReason = QTKD.Domain.Identity.SessionEndReason;
using RecordType = QTKD.Domain.Notifications.RecordType;
using SendStatus = QTKD.Domain.Notifications.SendStatus;
using QTKD.Infrastructure.Persistence.Schema;

namespace QTKD.Infrastructure.Persistence.Configurations.Customers;

/// <summary>qtkd.customer. Names follow the original Prisma DDL; CHECKs, triggers and expression indexes live in migration SQL.</summary>
public sealed class CustomerConfiguration : IEntityTypeConfiguration<Customer>
{
    public void Configure(EntityTypeBuilder<Customer> b)
    {
        b.ToTable("customer");
        b.HasKey(x => x.CustomerId).HasName("customer_pkey");
        b.Property(x => x.CustomerCode).HasColumnName("customer_code").HasColumnType("character varying(50)").HasDefaultValueSql("('KH-'::text || lpad((nextval('qtkd.customer_code_seq'::regclass))::text, 6, '0'::text))");
        b.Property(x => x.CustomerId).HasColumnName("customer_id").HasColumnType("uuid").HasDefaultValueSql("gen_random_uuid()");
        b.Property(x => x.CustomerName).HasColumnName("customer_name").HasColumnType("character varying(250)");
        b.Property(x => x.TaxCode).HasColumnName("tax_code").HasColumnType("character varying(13)");
        b.Property(x => x.Address).HasColumnName("address").HasColumnType("text");
        b.Property(x => x.LegalRepresentative).HasColumnName("legal_representative").HasColumnType("character varying(200)");
        b.Property(x => x.ContactName).HasColumnName("contact_name").HasColumnType("character varying(200)");
        b.Property(x => x.ContactTitle).HasColumnName("contact_title").HasColumnType("character varying(150)");
        b.Property(x => x.Phone).HasColumnName("phone").HasColumnType("character varying(30)");
        b.Property(x => x.Email).HasColumnName("email").HasColumnType("character varying(254)");
        b.Property(x => x.CustomerGroup).HasColumnName("customer_group").HasColumnType("character varying(100)");
        b.Property(x => x.InterestedServices).HasColumnName("interested_services").HasColumnType("text");
        b.Property(x => x.Status).HasColumnName("status").HasDefaultValue(ActiveStatus.Active);
        b.Property(x => x.AccountManagerId).HasColumnName("account_manager_id").HasColumnType("uuid");
        b.Property(x => x.Version).HasColumnName("version").HasDefaultValue(1);
        b.Property(x => x.CustomerUpdatedAt).HasColumnName("customer_updated_at").HasColumnType("timestamp(6) with time zone");
        b.Property(x => x.FlowRevision).HasColumnName("flow_revision").HasDefaultValue(0);
        b.HasIndex(x => x.CustomerCode).IsUnique().HasDatabaseName("customer_customer_code_key");
        b.HasIndex(x => x.TaxCode).IsUnique().HasDatabaseName("customer_tax_code_key");
        b.HasIndex(x => x.AccountManagerId).HasDatabaseName("customer_account_manager_id_idx");
        b.HasOne<UserAccount>().WithMany().HasForeignKey(x => x.AccountManagerId)
            .HasConstraintName("customer_account_manager_id_fkey").OnDelete(DeleteBehavior.Restrict);
    }
}
