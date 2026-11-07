using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace QTKD.Infrastructure.Persistence.Migrations;

/// <summary>
/// Additive customer schema after main's EF baseline. The generated Designer/snapshot describe the
/// same four tables and three columns; SQL also preserves CHECKs, row guards and Supabase RLS.
/// </summary>
public partial class CustomerFlow : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder) =>
        MigrationSql.Run(migrationBuilder, "20261105104547_CustomerFlow");

    protected override void Down(MigrationBuilder migrationBuilder) =>
        throw new NotSupportedException("Customer flow contains decision and operation history. Use a reviewed forward migration to preserve it.");
}
