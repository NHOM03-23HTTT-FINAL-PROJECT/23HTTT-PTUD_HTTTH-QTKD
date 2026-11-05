using Microsoft.EntityFrameworkCore;
using Npgsql.NameTranslation;
using QTKD.Domain.Identity;
using PasswordOtp = QTKD.Infrastructure.Persistence.Schema.PasswordOtp;

namespace QTKD.Infrastructure.Persistence;

public sealed class IdentityDbContext(DbContextOptions<IdentityDbContext> options) : DbContext(options)
{
    public DbSet<UserAccount> Users => Set<UserAccount>();
    public DbSet<Department> Departments => Set<Department>();
    public DbSet<LoginSession> Sessions => Set<LoginSession>();
    public DbSet<PasswordOtp> PasswordOtps => Set<PasswordOtp>();
    public DbSet<RoleDefinition> Roles => Set<RoleDefinition>();
    public DbSet<Permission> Permissions => Set<Permission>();
    public DbSet<RolePermission> Grants => Set<RolePermission>();

    protected override void OnModelCreating(ModelBuilder b)
    {
        b.HasDefaultSchema("qtkd");
        b.Entity<UserAccount>().ToTable("user_account").HasKey(x => x.UserId);
        b.Entity<Department>().ToTable("department").HasKey(x => x.DepartmentId);
        b.Entity<LoginSession>().ToTable("login_session").HasKey(x => x.SessionId);
        b.Entity<PasswordOtp>().ToTable("password_otp").HasKey(x => x.OtpId);
        b.Entity<RoleDefinition>().ToTable("role_definition").HasKey(x => x.Code);
        b.Entity<RoleDefinition>().Property(x => x.Code).ValueGeneratedNever();
        b.Entity<Permission>().ToTable("permission").HasKey(x => x.Code);
        b.Entity<RolePermission>().ToTable("role_permission").HasKey(x => new { x.Role, x.PermissionCode });
        b.Entity<UserAccount>().HasOne<Department>().WithMany().HasForeignKey(x => x.DepartmentId).OnDelete(DeleteBehavior.Restrict);
        b.Entity<UserAccount>().HasOne<RoleDefinition>().WithMany().HasForeignKey(x => x.Role).OnDelete(DeleteBehavior.Restrict);
        b.Entity<LoginSession>().HasOne<UserAccount>().WithMany().HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Restrict);
        b.Entity<PasswordOtp>().HasOne<UserAccount>().WithMany().HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Restrict);
        b.Entity<RolePermission>().HasOne<RoleDefinition>().WithMany().HasForeignKey(x => x.Role).OnDelete(DeleteBehavior.Restrict);
        b.Entity<RolePermission>().HasOne<Permission>().WithMany().HasForeignKey(x => x.PermissionCode).OnDelete(DeleteBehavior.Restrict);
        b.Entity<Department>().HasIndex(x => x.Code).IsUnique();
        b.Entity<LoginSession>().HasIndex(x => x.RefreshTokenHash).IsUnique();
        b.Entity<LoginSession>().HasIndex(x => x.LogoutTokenHash).IsUnique();
        var translator = new NpgsqlSnakeCaseNameTranslator();
        foreach (var entity in b.Model.GetEntityTypes())
            foreach (var property in entity.GetProperties())
                property.SetColumnName(translator.TranslateMemberName(property.Name));
        // Test SQLite has real transactions/constraints but cannot validate PostgreSQL enums/RLS.
        if (Database.ProviderName?.Contains("Sqlite") == true)
        {
            b.Entity<UserAccount>().Property(x => x.Role).HasConversion<string>();
            b.Entity<UserAccount>().Property(x => x.Status).HasConversion<string>();
            b.Entity<RoleDefinition>().Property(x => x.Code).HasConversion<string>();
            b.Entity<RolePermission>().Property(x => x.Role).HasConversion<string>();
            b.Entity<LoginSession>().Property(x => x.EndReason).HasConversion<string>();
        }
    }

    public async Task LockUser(Guid id, CancellationToken ct)
    {
        if (Database.IsNpgsql())
            await Users.FromSqlInterpolated($"SELECT * FROM qtkd.user_account WHERE user_id = {id} FOR UPDATE").LoadAsync(ct);
        // Authentication may already have tracked this user before another request changed the password/role.
        // EF tracking queries don't overwrite that snapshot; reload while holding the transaction lock.
        var tracked = ChangeTracker.Entries<UserAccount>().FirstOrDefault(x => x.Entity.UserId == id);
        if (tracked is not null) await tracked.ReloadAsync(ct);
    }
    public async Task LockAdministration(CancellationToken ct)
    {
        if (Database.IsNpgsql())
            await Database.ExecuteSqlRawAsync("SELECT pg_advisory_xact_lock(22023)", ct);
    }

    public async Task RevokeSessions(Guid userId, string reason, CancellationToken ct, Guid? except = null)
    {
        var sessions = await Sessions.Where(x => x.UserId == userId && !x.IsRevoked && (except == null || x.SessionId != except)).ToListAsync(ct);
        foreach (var session in sessions)
        {
            session.IsRevoked = true;
            session.EndReason = SessionEndReason.Revoked;
            session.RevocationReason = reason;
        }
    }

    public Task InvalidatePasswordRecovery(Guid userId, CancellationToken ct) => PasswordOtps
        .Where(x => x.UserId == userId && x.OtpHash != "")
        .ExecuteUpdateAsync(set => set.SetProperty(x => x.IsUsed, true).SetProperty(x => x.OtpHash, ""), ct);
}
