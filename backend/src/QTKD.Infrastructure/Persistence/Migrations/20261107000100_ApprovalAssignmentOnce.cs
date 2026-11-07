using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

namespace QTKD.Infrastructure.Persistence.Migrations;

[DbContext(typeof(QtkdDbContext))]
[Migration("20261107000100_ApprovalAssignmentOnce")]
public sealed class ApprovalAssignmentOnce : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder) => MigrationSql.Run(migrationBuilder, "202611070001_approval_assignment_once");
    protected override void Down(MigrationBuilder migrationBuilder) =>
        throw new NotSupportedException("Restore from backup to roll back approval history safeguards.");
}
