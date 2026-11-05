using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using QTKD.Infrastructure.Persistence.Schema;

namespace QTKD.Infrastructure.Persistence.Configurations.Customers;

public sealed class CustomerStatusOutboxConfiguration : IEntityTypeConfiguration<CustomerStatusOutbox>
{
    public void Configure(EntityTypeBuilder<CustomerStatusOutbox> b)
    {
        b.ToTable("customer_status_outbox");
        b.HasKey(x => x.DecisionId).HasName("customer_status_outbox_pkey");
        b.Property(x => x.DecisionId).HasColumnName("decision_id").HasColumnType("uuid").ValueGeneratedNever();
        b.Property(x => x.Payload).HasColumnName("payload").HasColumnType("jsonb");
        b.Property(x => x.Status).HasColumnName("status").HasColumnType("character varying(20)").HasDefaultValue("Pending");
        b.Property(x => x.Attempts).HasColumnName("attempts").HasDefaultValue(0);
        b.Property(x => x.CreatedAt).HasColumnName("created_at").HasColumnType("timestamp(6) with time zone").HasDefaultValueSql("CURRENT_TIMESTAMP");
        b.HasOne<CustomerStatusDecision>().WithMany().HasForeignKey(x => x.DecisionId).HasConstraintName("customer_status_outbox_decision_id_fkey").OnDelete(DeleteBehavior.Restrict);
    }
}
