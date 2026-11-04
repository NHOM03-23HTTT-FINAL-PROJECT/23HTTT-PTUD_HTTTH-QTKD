using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace QTKD.Infrastructure.Persistence.Migrations
{
    /// <summary>Prisma migration 202611030002_workflow_config, kept as-is (Migrations/Sql/202611030002_workflow_config.sql). Already applied on DBs built by Prisma; see QTKD.DbTool adopt.</summary>
    [DbContext(typeof(QtkdDbContext))]
    [Migration("20261103000200_PrismaWorkflowConfig")]
    public partial class PrismaWorkflowConfig : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder) => MigrationSql.Run(migrationBuilder, "202611030002_workflow_config");

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder) =>
            throw new NotSupportedException("Baseline migrations are not reversible; restore from backup instead.");
    }
}
