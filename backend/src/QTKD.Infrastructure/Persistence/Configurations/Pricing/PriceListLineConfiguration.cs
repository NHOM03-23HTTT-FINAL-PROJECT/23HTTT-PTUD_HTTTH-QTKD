using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using UserRole = QTKD.Domain.Identity.UserRole;
using UserStatus = QTKD.Domain.Identity.UserStatus;
using SessionEndReason = QTKD.Domain.Identity.SessionEndReason;
using RecordType = QTKD.Domain.Notifications.RecordType;
using SendStatus = QTKD.Domain.Notifications.SendStatus;
using QTKD.Infrastructure.Persistence.Schema;

namespace QTKD.Infrastructure.Persistence.Configurations.Pricing;

/// <summary>qtkd.price_list_line. Names follow the original Prisma DDL; CHECKs, triggers and expression indexes live in migration SQL.</summary>
public sealed class PriceListLineConfiguration : IEntityTypeConfiguration<PriceListLine>
{
    public void Configure(EntityTypeBuilder<PriceListLine> b)
    {
        b.ToTable("price_list_line");
        b.HasKey(x => x.LineId).HasName("price_list_line_pkey");
        b.Property(x => x.LineId).HasColumnName("line_id").HasColumnType("uuid").HasDefaultValueSql("gen_random_uuid()");
        b.Property(x => x.PriceListId).HasColumnName("price_list_id").HasColumnType("uuid");
        b.Property(x => x.ServiceId).HasColumnName("service_id").HasColumnType("uuid");
        b.Property(x => x.AreaId).HasColumnName("area_id").HasColumnType("uuid");
        b.Property(x => x.UnitPrice).HasColumnName("unit_price").HasColumnType("numeric(19,2)");
        b.Property(x => x.Unit).HasColumnName("unit").HasColumnType("character varying(50)");
        b.HasIndex(x => new { x.PriceListId, x.ServiceId, x.AreaId }).IsUnique().HasDatabaseName("price_list_line_price_list_id_service_id_area_id_key");
        b.HasIndex(x => x.PriceListId).HasDatabaseName("price_list_line_price_list_id_idx");
        b.HasIndex(x => x.ServiceId).HasDatabaseName("price_list_line_service_id_idx");
        b.HasIndex(x => x.AreaId).HasDatabaseName("price_list_line_area_id_idx");
        b.HasOne<PriceList>().WithMany().HasForeignKey(x => x.PriceListId)
            .HasConstraintName("price_list_line_price_list_id_fkey").OnDelete(DeleteBehavior.Restrict);
        b.HasOne<QTKD.Domain.Entities.Service>().WithMany().HasForeignKey(x => x.ServiceId)
            .HasConstraintName("price_list_line_service_id_fkey").OnDelete(DeleteBehavior.Restrict);
        b.HasOne<QTKD.Domain.Entities.Area>().WithMany().HasForeignKey(x => x.AreaId)
            .HasConstraintName("price_list_line_area_id_fkey").OnDelete(DeleteBehavior.Restrict);
    }
}
