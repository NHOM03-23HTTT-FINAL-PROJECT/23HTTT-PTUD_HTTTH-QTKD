using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace QTKD.Infrastructure.Persistence.Migrations
{
    // Only the EF provider CLR enum changes. Both columns keep qtkd.active_status,
    // its existing labels and the Active default; no schema or data change is needed.
    public partial class CustomerAreaEnumAlignment : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
        }
    }
}
