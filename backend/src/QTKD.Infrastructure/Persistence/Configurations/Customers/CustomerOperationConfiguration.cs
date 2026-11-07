using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using QTKD.Infrastructure.Persistence.Schema;

namespace QTKD.Infrastructure.Persistence.Configurations.Customers;

public sealed class CustomerOperationConfiguration : IEntityTypeConfiguration<CustomerOperation>
{
    public void Configure(EntityTypeBuilder<CustomerOperation> b)
    {
        b.ToTable("customer_operation");
        b.HasKey(x => new { x.ActorId, x.Operation, x.RequestKey }).HasName("customer_operation_pkey");
        b.Property(x => x.ActorId).HasColumnName("actor_id").HasColumnType("uuid");
        b.Property(x => x.Operation).HasColumnName("operation").HasColumnType("character varying(40)");
        b.Property(x => x.RequestKey).HasColumnName("request_key").HasColumnType("character varying(100)");
        b.Property(x => x.RequestHash).HasColumnName("request_hash").HasColumnType("character varying(64)");
        b.Property(x => x.CustomerId).HasColumnName("customer_id").HasColumnType("uuid");
        b.Property(x => x.Response).HasColumnName("response").HasColumnType("jsonb");
        b.Property(x => x.CreatedAt).HasColumnName("created_at").HasColumnType("timestamp(6) with time zone").HasDefaultValueSql("CURRENT_TIMESTAMP");
        b.HasIndex(x => x.CustomerId).HasDatabaseName("customer_operation_customer_id_idx");
        b.HasOne<UserAccount>().WithMany().HasForeignKey(x => x.ActorId).HasConstraintName("customer_operation_actor_id_fkey").OnDelete(DeleteBehavior.Restrict);
        b.HasOne<Customer>().WithMany().HasForeignKey(x => x.CustomerId).HasConstraintName("customer_operation_customer_id_fkey").OnDelete(DeleteBehavior.Restrict);
    }
}
