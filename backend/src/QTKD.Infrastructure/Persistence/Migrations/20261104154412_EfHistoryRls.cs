using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace QTKD.Infrastructure.Persistence.Migrations
{
    /// <summary>
    /// First EF-native migration. Its Designer/snapshot carry the full model of the schema left by the Prisma baseline,
    /// so later "dotnet ef migrations add" only emits real changes. The body only protects the EF history table.
    /// </summary>
    public partial class EfHistoryRls : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder) => MigrationSql.Run(migrationBuilder, "20261104154412_EfHistoryRls");

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder) =>
            migrationBuilder.Sql("""ALTER TABLE qtkd."__EFMigrationsHistory" DISABLE ROW LEVEL SECURITY;""");
    }
}
