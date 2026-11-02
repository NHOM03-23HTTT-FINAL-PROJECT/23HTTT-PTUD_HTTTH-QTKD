using Xunit;
namespace QTKD.IntegrationTests;
public sealed class PostgreSqlFactAttribute : FactAttribute
{
    public PostgreSqlFactAttribute()
    {
        if (string.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable("QTKD_TEST_DATABASE_CONNECTION")))
            Skip = "Requires a dedicated disposable Supabase test database; SQLite cannot prove PostgreSQL row locking.";
    }
}
