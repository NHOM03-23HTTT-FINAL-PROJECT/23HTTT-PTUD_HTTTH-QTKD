using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using QTKD.Infrastructure.Persistence.Schema;

namespace QTKD.Infrastructure.Persistence.Configurations.Customers;

public sealed class CustomerStatusDelegationConfiguration : IEntityTypeConfiguration<CustomerStatusDelegation>
{
    public void Configure(EntityTypeBuilder<CustomerStatusDelegation> b)
    {
        b.ToTable("customer_status_delegation");
        b.HasKey(x => x.DelegationId).HasName("customer_status_delegation_pkey");
        b.Property(x => x.DelegationId).HasColumnName("delegation_id").HasColumnType("uuid").HasDefaultValueSql("gen_random_uuid()");
        b.Property(x => x.GranteeId).HasColumnName("grantee_id").HasColumnType("uuid");
        b.Property(x => x.GrantedBy).HasColumnName("granted_by").HasColumnType("uuid");
        b.Property(x => x.DepartmentId).HasColumnName("department_id").HasColumnType("uuid");
        b.Property(x => x.Action).HasColumnName("action");
        b.Property(x => x.Reason).HasColumnName("reason").HasColumnType("text");
        b.Property(x => x.GrantedAt).HasColumnName("granted_at").HasColumnType("timestamp(6) with time zone").HasDefaultValueSql("CURRENT_TIMESTAMP");
        b.Property(x => x.ExpiresAt).HasColumnName("expires_at").HasColumnType("timestamp(6) with time zone");
        b.Property(x => x.RevokedAt).HasColumnName("revoked_at").HasColumnType("timestamp(6) with time zone");
        b.Property(x => x.RevokedBy).HasColumnName("revoked_by").HasColumnType("uuid");
        b.HasIndex(x => new { x.GranteeId, x.Action }).HasDatabaseName("customer_status_delegation_grantee_id_action_idx");
        b.HasIndex(x => x.DepartmentId).HasDatabaseName("customer_status_delegation_department_id_idx");
        b.HasOne<UserAccount>().WithMany().HasForeignKey(x => x.GranteeId).HasConstraintName("customer_status_delegation_grantee_id_fkey").OnDelete(DeleteBehavior.Restrict);
        b.HasOne<UserAccount>().WithMany().HasForeignKey(x => x.GrantedBy).HasConstraintName("customer_status_delegation_granted_by_fkey").OnDelete(DeleteBehavior.Restrict);
        b.HasOne<UserAccount>().WithMany().HasForeignKey(x => x.RevokedBy).HasConstraintName("customer_status_delegation_revoked_by_fkey").OnDelete(DeleteBehavior.Restrict);
        b.HasOne<Department>().WithMany().HasForeignKey(x => x.DepartmentId).HasConstraintName("customer_status_delegation_department_id_fkey").OnDelete(DeleteBehavior.Restrict);
    }
}
