using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using QTKD.Infrastructure.Persistence.Schema;

namespace QTKD.Infrastructure.Persistence.Configurations.Customers;

public sealed class CustomerProfileDataConfiguration : IEntityTypeConfiguration<CustomerProfileData>
{
    public void Configure(EntityTypeBuilder<CustomerProfileData> b)
    {
        b.ToTable("customer_profile_data");
        b.HasKey(x => x.CustomerId).HasName("customer_profile_data_pkey");
        b.Property(x => x.CustomerId).HasColumnName("customer_id").HasColumnType("uuid").ValueGeneratedNever();
        b.Property(x => x.ServiceGroups).HasColumnName("service_groups").HasColumnType("text[]").HasDefaultValueSql("ARRAY[]::text[]");
        b.Property(x => x.CreatedAt).HasColumnName("created_at").HasColumnType("timestamp(6) with time zone");
        b.Property(x => x.CreatedBy).HasColumnName("created_by").HasColumnType("uuid");
        b.Property(x => x.UpdatedAt).HasColumnName("updated_at").HasColumnType("timestamp(6) with time zone");
        b.HasOne<Customer>().WithMany().HasForeignKey(x => x.CustomerId).HasConstraintName("customer_profile_data_customer_id_fkey").OnDelete(DeleteBehavior.Restrict);
        b.HasOne<UserAccount>().WithMany().HasForeignKey(x => x.CreatedBy).HasConstraintName("customer_profile_data_created_by_fkey").OnDelete(DeleteBehavior.Restrict);
    }
}
