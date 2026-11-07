using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace QTKD.Infrastructure.Persistence.Migrations
{
    // Metadata-only alignment: main's Domain area types and the customer enum
    // conversion use the same existing PG type/default. No DDL/data rewrite.
    public partial class CustomerEfRepositoryAlignment : Migration
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
