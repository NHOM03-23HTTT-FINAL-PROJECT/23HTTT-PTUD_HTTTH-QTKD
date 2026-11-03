using System.Text.RegularExpressions;
using Npgsql;
using QTKD.Application.Features.WorkflowConfigs;
using QTKD.Infrastructure.ContractApprovals;
using QTKD.Infrastructure.WorkflowConfigs;
using Xunit;

namespace QTKD.IntegrationTests;

// Opt-in (QTKD_APPROVAL_ROLLBACK_CONNECTION): real SQL of PostgresWorkflowConfigStore and the
// workflow_config triggers/indexes. Everything, including the migration when the table is missing,
// runs in one transaction that is always rolled back.
public sealed class WorkflowConfigPostgresRollbackTests
{
    [ApprovalPostgresRollbackFact]
    public async Task Versions_activate_conflict_replay_and_history_is_immutable_then_rollback()
    {
        await using var connection = new NpgsqlConnection(Environment.GetEnvironmentVariable("QTKD_APPROVAL_ROLLBACK_CONNECTION"));
        await connection.OpenAsync();
        await using var transaction = await connection.BeginTransactionAsync();
        var prefix = "workflow.rollback." + Guid.NewGuid().ToString("N")[..12];
        async Task Exec(string sql, params (string Name, object? Value)[] args)
        {
            await using var cmd = PostgresApprovalStore.Command(connection, transaction, sql, args);
            await cmd.ExecuteNonQueryAsync();
        }
        try
        {
            await using (var exists = PostgresApprovalStore.Command(connection, transaction, "SELECT to_regclass('qtkd.workflow_config') IS NOT NULL"))
                if (!(bool)(await exists.ExecuteScalarAsync())!)
                {
                    var migration = await File.ReadAllTextAsync(Path.Combine(AppContext.BaseDirectory, "workflow-config.sql"));
                    await Exec(Regex.Replace(migration, @"(?m)^\s*(BEGIN|COMMIT);\s*$", ""));
                }
            var people = new (string Role, string Dept, bool Sign)[] { ("SystemAdmin", "QTHT", false), ("SalesStaff", "KD", false),
                ("SalesManager", "KD", false), ("LegalStaff", "PC", false), ("BoardMember", "BGD", true) };
            var ids = people.Select(_ => Guid.NewGuid()).ToArray();
            for (var i = 0; i < people.Length; i++)
                await Exec("""
                    INSERT INTO qtkd.user_account(user_id,username,company_email,password_hash,full_name,department_id,role,status,failed_login_count,must_change_password,can_sign)
                    SELECT @id,@name,@email,'unused-test-hash',@name,department_id,@role::qtkd.user_role,'Active',0,false,@sign FROM qtkd.department WHERE code=@dept
                    """, ("id", ids[i]), ("name", prefix + "." + i), ("email", prefix + "." + i + "@example.invalid"), ("role", people[i].Role),
                    ("dept", people[i].Dept), ("sign", people[i].Sign));
            await Exec("INSERT INTO qtkd.role_permission(role,permission_code) VALUES('SystemAdmin','workflows.manage'),('SalesStaff','contracts.create') ON CONFLICT DO NOTHING");
            // Deactivation is the one change the history trigger allows; isolates this run from existing rows.
            await Exec("UPDATE qtkd.workflow_config SET is_active=false WHERE is_active AND doc_type='termination'");

            var service = new WorkflowConfigService(new PostgresWorkflowConfigStore(new RollbackSessions(connection, transaction)));
            WorkflowStage S(string key, Guid person) => new(key, true, "Vai trò", "specific", [person], [], []);
            var draft = new WorkflowDraft(prefix, "termination", "KD", [S("draft", ids[1]), S("sales", ids[2]), S("legal", ids[3]), S("board", ids[4]), S("signing", ids[4])]);

            var v1 = (await service.Create(ids[0], prefix + ".1", new(draft), default)).Config;
            Assert.Equal("QT-CD-KD", v1.Code);
            var replay = await service.Create(ids[0], prefix + ".1", new(draft), default);
            Assert.True(replay.Replayed);
            Assert.Equal(v1.Version, replay.Config.Version);
            var duplicate = await Assert.ThrowsAsync<WorkflowConfigFailure>(() => service.Create(ids[0], prefix + ".2", new(draft), default));
            Assert.Equal("DUPLICATE_SCOPE", duplicate.Code);
            var v2 = (await service.Update(ids[0], prefix + ".3", v1.Code, new(v1.Version, draft with { Name = prefix + " v2" }), default)).Config;
            Assert.Equal(v1.Version + 1, v2.Version);
            Assert.Equal(draft.Stages, v2.History.Single(h => h.Version == v1.Version).Stages);
            var stale = await Assert.ThrowsAsync<WorkflowConfigFailure>(() => service.Update(ids[0], prefix + ".4", v1.Code, new(v1.Version, draft), default));
            Assert.Equal("CONFLICT", stale.Code);
            Assert.Equal(v2.Version, (await service.Get(v1.Code, default)).Version);
            Assert.Contains(await service.List(default), row => row.DocType == "termination" && row.Scope == "KD" && row.Config?.Version == v2.Version);

            await using (var count = PostgresApprovalStore.Command(connection, transaction,
                "SELECT count(*) FROM qtkd.audit_log WHERE entity_type='WorkflowConfig' AND actor_id=@actor", ("actor", ids[0])))
                Assert.Equal(2L, await count.ExecuteScalarAsync());
            foreach (var sql in new[] { "UPDATE qtkd.workflow_config SET config_name='rewritten' WHERE code=@code AND version=@version",
                "DELETE FROM qtkd.workflow_config WHERE code=@code AND version=@version",
                "UPDATE qtkd.workflow_config SET is_active=true WHERE code=@code AND version=@version" })
            {
                await Exec("SAVEPOINT immutable");
                var error = await Assert.ThrowsAsync<PostgresException>(() => Exec(sql, ("code", v1.Code), ("version", v1.Version)));
                Assert.True(error.SqlState is PostgresErrorCodes.CheckViolation or PostgresErrorCodes.UniqueViolation, error.SqlState);
                await Exec("ROLLBACK TO SAVEPOINT immutable");
            }
        }
        finally { await transaction.RollbackAsync(); }
        await using var cleanup = new NpgsqlCommand("SELECT count(*) FROM qtkd.user_account WHERE username LIKE @prefix", connection);
        cleanup.Parameters.AddWithValue("prefix", prefix + "%");
        Assert.Equal(0L, await cleanup.ExecuteScalarAsync());
    }

    private sealed class RollbackSessions(NpgsqlConnection c, NpgsqlTransaction tx) : IApprovalDbSessions
    {
        public Task<ApprovalDbSession> Open(bool write, CancellationToken ct) => Task.FromResult(new ApprovalDbSession(c, tx, false));
    }
}
