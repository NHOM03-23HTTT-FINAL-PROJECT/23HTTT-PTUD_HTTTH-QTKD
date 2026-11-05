using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace QTKD.Infrastructure.Persistence.Migrations
{
    /// <summary>Prisma migration 202611020001_dictionary, kept as-is (Migrations/Sql/202611020001_dictionary.sql). Already applied on DBs built by Prisma; see QTKD.DbTool adopt.</summary>
    [DbContext(typeof(QtkdDbContext))]
    [Migration("20261102000100_PrismaDictionary")]
    public partial class PrismaDictionary : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder) => MigrationSql.Run(migrationBuilder, "202611020001_dictionary");

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder) =>
            throw new NotSupportedException("Baseline migrations are not reversible; restore from backup instead.");
    }
}
