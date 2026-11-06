using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using UserRole = QTKD.Domain.Identity.UserRole;
using UserStatus = QTKD.Domain.Identity.UserStatus;
using SessionEndReason = QTKD.Domain.Identity.SessionEndReason;
using RecordType = QTKD.Domain.Notifications.RecordType;
using SendStatus = QTKD.Domain.Notifications.SendStatus;
using QTKD.Infrastructure.Persistence.Schema;
using Service = QTKD.Domain.Entities.Service;

namespace QTKD.Infrastructure.Persistence.Configurations.Catalogs;

/// <summary>qtkd.service. Names follow the original Prisma DDL; CHECKs, triggers and expression indexes live in migration SQL.</summary>
public sealed class ServiceConfiguration : IEntityTypeConfiguration<Service>
{
    public void Configure(EntityTypeBuilder<Service> b)
    {
        b.ToTable("service");
        b.HasKey(x => x.ServiceId).HasName("service_pkey");
        b.Property(x => x.ServiceCode).HasColumnName("service_code").HasColumnType("character varying(50)").HasDefaultValueSql("('DV-'::text || lpad((nextval('qtkd.service_code_seq'::regclass))::text, 6, '0'::text))");
        b.Property(x => x.RequiresArea).HasColumnName("requires_area").HasDefaultValue(true);
        b.Property(x => x.ServiceId).HasColumnName("service_id").HasColumnType("uuid").HasDefaultValueSql("gen_random_uuid()");
        b.Property(x => x.ServiceName).HasColumnName("service_name").HasColumnType("character varying(200)");
        b.Property(x => x.Unit).HasColumnName("unit").HasColumnType("character varying(50)");
        b.Property(x => x.IsMandatory).HasColumnName("is_mandatory").HasDefaultValue(false);
        b.HasIndex(x => x.ServiceCode).IsUnique().HasDatabaseName("service_service_code_key");
    }
}
