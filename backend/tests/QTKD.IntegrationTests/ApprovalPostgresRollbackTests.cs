using System.Text.Json;
using System.Text.RegularExpressions;
using Npgsql;
using QTKD.Application.Features.ContractApprovals;
using QTKD.Application.Features.Workflows;
using QTKD.Infrastructure.ContractApprovals;
using QTKD.Application.Features.Identity;
using QTKD.Domain.Identity;
using Xunit;

namespace QTKD.IntegrationTests;

public sealed class ApprovalPostgresRollbackFactAttribute : FactAttribute
{
    public ApprovalPostgresRollbackFactAttribute()
    {
        if (string.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable("QTKD_APPROVAL_ROLLBACK_CONNECTION")))
            Skip = "Opt-in: Supabase fixture inserts are enclosed in one transaction and always rolled back; no migration or committed test writes.";
    }
}
public sealed class ApprovalPostgresRollbackTests
{
    [ApprovalPostgresRollbackFact]
    public async Task Supabase_real_sql_three_levels_and_receipts_remain_consistent_then_rollback()
    {
        await using var connection = new NpgsqlConnection(Environment.GetEnvironmentVariable("QTKD_APPROVAL_ROLLBACK_CONNECTION"));
        await connection.OpenAsync();
        await using var transaction = await connection.BeginTransactionAsync();
        var ct = CancellationToken.None;
        var prefix = "approval.rollback." + Guid.NewGuid().ToString("N")[..12];
        async Task Exec(string sql, params (string Name, object? Value)[] args)
        {
            await using var cmd = PostgresApprovalStore.Command(connection, transaction, sql, args);
            await cmd.ExecuteNonQueryAsync();
        }
        try
        {
            var roles = new[] { "SalesStaff", "SalesManager", "LegalStaff", "BoardMember", "OperationsStaff", "SystemAdmin" };
            var departments = new[] { "KD", "KD", "PC", "BGD", "KT", "QTHT" };
            var users = roles.Select(_ => Guid.NewGuid()).ToArray();
            for (var i = 0; i < roles.Length; i++)
                await Exec("""
                    INSERT INTO qtkd.user_account(user_id,username,company_email,password_hash,full_name,department_id,role,status,failed_login_count,must_change_password,can_sign)
                    SELECT @id,@name,@email,'unused-test-hash',@name,department_id,@role::qtkd.user_role,'Active',0,false,false
                    FROM qtkd.department WHERE code=@dept
                    """, ("id", users[i]), ("name", prefix + "." + i), ("email", prefix + "." + i + "@example.invalid"), ("role", roles[i]), ("dept", departments[i]));
            foreach (var role in new[] { "SalesManager", "LegalStaff", "BoardMember" })
                await Exec("INSERT INTO qtkd.role_permission(role,permission_code) VALUES(@role::qtkd.user_role,@permission) ON CONFLICT DO NOTHING",
                    ("role", role), ("permission", role == "LegalStaff" ? "approvals.review-legal" : "approvals.approve"));
            var id = Guid.NewGuid(); var round = Guid.NewGuid();
            await Exec("""
                INSERT INTO qtkd.contract(contract_id,customer_id,title,contract_type,start_date,end_date,contract_value,payment_terms,content,status,owner_id,version,created_at,updated_at)
                SELECT @id,customer_id,@title,'Test',CURRENT_DATE,CURRENT_DATE+30,1000,'Payment','Content','Submitted',@owner,3,now(),now()
                FROM qtkd.customer ORDER BY customer_id LIMIT 1
                """, ("id", id), ("title", prefix), ("owner", users[0]));
            await Exec("""
                INSERT INTO qtkd.approval_round(round_id,record_type,contract_id,record_version,round_no,submitted_by,submitted_at,result,record_snapshot)
                VALUES(@round,'Contract',@id,3,1,@owner,now(),'Running',@snapshot::jsonb)
                """, ("round", round), ("id", id), ("owner", users[0]),
                ("snapshot", JsonSerializer.Serialize(new { workflow = new { version = 1, stages = new[] { "SalesManager", "LegalStaff", "BoardMember" } } })));
            var identities = new ApprovalIdentityStub(users.Select((u, i) => new AuthUser(u, prefix + i, "synthetic@example.invalid", roles[i], departments[i],
                [IdentityCodes.RoleCodes[Enum.Parse<UserRole>(roles[i])]], i == 2 ? ["approvals.review-legal"] : [], false, null, "Active")).ToDictionary(u => u.Id));
            var sessions = new RollbackSessions(connection, transaction);
            var coordination = new ContractCoordinationService(sessions, identities);
            for (var i = 0; i < 3; i++)
                await Exec("""
                    INSERT INTO qtkd.approval_step(step_id,round_id,step_name,step_order,assignee_id,assigned_at,step_status)
                    VALUES(@step,@round,@name,@order,@actor,CASE WHEN @order=1 THEN now() ELSE NULL END,@state::qtkd.approval_step_status)
                    """, ("step", Guid.NewGuid()), ("round", round), ("name", roles[i + 1]), ("order", i + 1), ("actor", users[i + 1]), ("state", i == 0 ? "Pending" : "NotStarted"));
            var store = new RollbackStore(connection, transaction, id);
            var engine = new ContractApprovalEngine(store, new WorkflowEngine(), TimeProvider.System);
            var document = (await store.Read(id, ct))!;
            Assert.Equal(3, document.Steps.Count);
            ReviewCommand? last = null;
            foreach (var (step, action) in new[] { ("sales", "accept"), ("sales", "approve"), ("legal", "approve"), ("legal", "handoff"), ("board", "approve") })
            {
                document = (await store.Read(id, ct))!;
                last = WorkflowEngineTests.Command(document, step, action);
                await engine.Execute(last, ct);
                if (step == "sales" && action == "approve")
                {
                    var current = (await store.Read(id, ct))!;
                    var expected = WorkflowEngineTests.Command(current, "legal", "approve").Expected;
                    var asked = await coordination.Request(users[2], id, new(expected, "KT", "Verify operational terms"), ct);
                    Assert.Single(await coordination.List(users[4], null, ct));
                    Assert.Empty(await coordination.List(users[3], null, ct));
                    var forbidden = await Assert.ThrowsAsync<ReviewFailure>(() => coordination.Reply(users[2], id, asked.Id, "Wrong department", ct));
                    Assert.Equal(403, forbidden.Status);
                    await coordination.Reply(users[4], id, asked.Id, "Operational terms confirmed", ct);
                    Assert.Equal("Operational terms confirmed", Assert.Single(await coordination.List(users[2], id, ct)).Reply);
                    var repeated = await Assert.ThrowsAsync<ReviewFailure>(() => coordination.Reply(users[4], id, asked.Id, "Duplicate", ct));
                    Assert.Equal(409, repeated.Status);
                }
                if (step == "legal" && action == "approve")
                {
                    var waiting = (await store.Read(id, ct))!;
                    Assert.Equal("waiting", waiting.Steps[2].State); Assert.Equal("under-review", waiting.Status);
                }
            }
            var approved = (await store.Read(id, ct))!;
            Assert.Equal("approved", approved.Status); Assert.Equal("completed", approved.RoundResult);
            Assert.All(approved.Steps, s => Assert.Equal("approve", s.Decision));
            await engine.Execute(last!, ct); // real SQL receipt replay after source is already Approved
            await using var auditCount = PostgresApprovalStore.Command(connection, transaction,
                "SELECT count(*) FROM qtkd.audit_log WHERE entity_id=@id AND entity_type='ContractApproval'", ("id", id));
            Assert.Equal(5L, await auditCount.ExecuteScalarAsync());
            await using var messages = PostgresApprovalStore.Command(connection, transaction,
                "SELECT count(*) FROM qtkd.notification WHERE record_id=@id AND send_status='Pending'", ("id", id));
            Assert.True((long)(await messages.ExecuteScalarAsync())! > 0);
            // Version remains the submitted content version; decisions do not silently edit content.
            Assert.Equal(3, approved.Version);
            // Exercise real database constraints for every reject/revision branch as well.
            foreach (var (stopAt, action) in new[] { ("sales", "revision"), ("legal", "revision"), ("board", "revision"), ("sales", "reject"), ("legal", "reject"), ("board", "reject") })
            {
                var branch = Guid.NewGuid(); var branchRound = Guid.NewGuid();
                await Exec("""
                    INSERT INTO qtkd.contract(contract_id,customer_id,title,contract_type,start_date,end_date,contract_value,payment_terms,content,status,owner_id,version,created_at,updated_at)
                    SELECT @branch,customer_id,title,contract_type,start_date,end_date,contract_value,payment_terms,content,'Submitted',owner_id,3,now(),now()
                    FROM qtkd.contract WHERE contract_id=@source
                    """, ("branch", branch), ("source", id));
                await Exec("""
                    INSERT INTO qtkd.approval_round(round_id,record_type,contract_id,record_version,round_no,submitted_by,submitted_at,result,record_snapshot)
                    SELECT @round,'Contract',@branch,3,1,submitted_by,now(),'Running',record_snapshot FROM qtkd.approval_round WHERE round_id=@source
                    """, ("round", branchRound), ("branch", branch), ("source", round));
                for (var i = 0; i < 3; i++)
                    await Exec("""
                        INSERT INTO qtkd.approval_step(step_id,round_id,step_name,step_order,assignee_id,assigned_at,step_status)
                        VALUES(gen_random_uuid(),@round,@name,@order,@actor,CASE WHEN @order=1 THEN now() ELSE NULL END,@state::qtkd.approval_step_status)
                        """, ("round", branchRound), ("name", roles[i + 1]), ("order", i + 1), ("actor", users[i + 1]), ("state", i == 0 ? "Pending" : "NotStarted"));
                var branchStore = new RollbackStore(connection, transaction, branch);
                var branchEngine = new ContractApprovalEngine(branchStore, new(), TimeProvider.System);
                async Task Act(string step, string decision)
                {
                    var current = (await branchStore.Read(branch, ct))!;
                    await branchEngine.Execute(WorkflowEngineTests.Command(current, step, decision), ct);
                }
                await Act("sales", "accept");
                if (stopAt != "sales") await Act("sales", "approve");
                if (stopAt == "board") { await Act("legal", "approve"); await Act("legal", "handoff"); }
                await Act(stopAt, action);
                var stopped = (await branchStore.Read(branch, ct))!;
                Assert.Equal(action == "revision" ? "revision-requested" : "rejected", stopped.Status);
                Assert.DoesNotContain(stopped.Steps, s => s.State == "reviewing");
            }
            // DB immutability is verified inside a savepoint, with no persistent edits.
            await transaction.SaveAsync("freeze_check");
            var frozen = await Assert.ThrowsAsync<PostgresException>(() => Exec("UPDATE qtkd.contract SET content='changed' WHERE contract_id=@id", ("id", id)));
            Assert.Equal("23514", frozen.SqlState); await transaction.RollbackAsync("freeze_check");
            await transaction.SaveAsync("snapshot_check");
            var immutable = await Assert.ThrowsAsync<PostgresException>(() => Exec("UPDATE qtkd.approval_round SET record_snapshot='{}'::jsonb WHERE round_id=@round", ("round", round)));
            Assert.Equal("23514", immutable.SqlState); await transaction.RollbackAsync("snapshot_check");
            // Replay the exact additive migration against session-private table copies.
            // qtkd schema, live triggers and migration history are never altered by this test.
            await Exec("CREATE TEMP TABLE approval_round (LIKE qtkd.approval_round INCLUDING ALL) ON COMMIT DROP");
            await Exec("CREATE TEMP TABLE approval_step (LIKE qtkd.approval_step INCLUDING ALL) ON COMMIT DROP");
            await Exec("ALTER TABLE pg_temp.approval_step DROP CONSTRAINT IF EXISTS step_current_assignee");
            var migration = await File.ReadAllTextAsync(Path.Combine(AppContext.BaseDirectory, "approval-unassigned.sql"));
            migration = Regex.Replace(migration, @"(?m)^\s*(BEGIN|COMMIT);\s*$", "");
            migration = migration.Replace("\"qtkd\".", "\"pg_temp\".").Replace("qtkd.", "pg_temp.").Replace("pg_catalog, qtkd", "pg_catalog, pg_temp");
            await Exec(migration);
            await Exec("""
                INSERT INTO pg_temp.approval_round(round_id,record_type,contract_id,statement_id,record_version,round_no,submitted_by,submitted_at,result,ended_at,record_snapshot)
                SELECT round_id,record_type,contract_id,statement_id,record_version,round_no,submitted_by,submitted_at,'Running',NULL,record_snapshot
                FROM qtkd.approval_round WHERE round_id=@round
                """, ("round", round));
            // Enumerate columns explicitly: physical column order is not a storage contract.
            await Exec("""
                INSERT INTO pg_temp.approval_step(step_id,round_id,step_name,step_order,assignee_id,assigned_at,accepted_at,step_status,decision,comment,legal_conclusion,decided_by,decided_at)
                SELECT step_id,round_id,step_name,step_order,CASE WHEN step_order=3 THEN NULL ELSE assignee_id END,
                CASE WHEN step_order=3 THEN NULL ELSE assigned_at END,CASE WHEN step_order=3 THEN NULL ELSE accepted_at END,
                CASE WHEN step_order=3 THEN 'NotStarted'::qtkd.approval_step_status ELSE step_status END,
                CASE WHEN step_order=3 THEN NULL ELSE decision END,CASE WHEN step_order=3 THEN NULL ELSE comment END,
                CASE WHEN step_order=3 THEN NULL ELSE legal_conclusion END,CASE WHEN step_order=3 THEN NULL ELSE decided_by END,
                CASE WHEN step_order=3 THEN NULL ELSE decided_at END
                FROM qtkd.approval_step WHERE round_id=@round
                """, ("round", round));
            await Exec("CREATE TRIGGER temp_step_history BEFORE UPDATE OR DELETE ON pg_temp.approval_step FOR EACH ROW EXECUTE FUNCTION pg_temp.guard_approval_history()");
            await transaction.SaveAsync("missing_assignee");
            var missing = await Assert.ThrowsAsync<PostgresException>(() => Exec("UPDATE pg_temp.approval_step SET step_status='Reviewing',assigned_at=now() WHERE round_id=@round AND step_order=3", ("round", round)));
            Assert.Equal("23514", missing.SqlState); await transaction.RollbackAsync("missing_assignee");
            await Exec("UPDATE pg_temp.approval_step SET assignee_id=@assignee WHERE round_id=@round AND step_order=3", ("assignee", users[3]), ("round", round));
            await transaction.SaveAsync("pinned_assignee");
            var pinned = await Assert.ThrowsAsync<PostgresException>(() => Exec("UPDATE pg_temp.approval_step SET assignee_id=@assignee WHERE round_id=@round AND step_order=3", ("assignee", users[1]), ("round", round)));
            Assert.Equal("23514", pinned.SqlState); await transaction.RollbackAsync("pinned_assignee");
        }
        finally { await transaction.RollbackAsync(); }
        await using var cleanup = new NpgsqlCommand("SELECT count(*) FROM qtkd.user_account WHERE username LIKE @prefix", connection);
        cleanup.Parameters.AddWithValue("prefix", prefix + "%");
        Assert.Equal(0L, await cleanup.ExecuteScalarAsync());
    }
    private sealed class RollbackStore(NpgsqlConnection c, NpgsqlTransaction tx, Guid id) : IApprovalStore
    {
        public Task<IReadOnlyList<ReviewDocument>> Inbox(ReviewActor actor, string step, bool done, CancellationToken ct) => throw new NotSupportedException();
        public async Task<ReviewDocument?> Read(Guid document, CancellationToken ct) => (await PostgresApprovalStore.Load(c, tx, document, ct))?.Document;
        public async Task<T> Locked<T>(Guid document, Func<IApprovalTransaction, Task<T>> action, CancellationToken ct)
        {
            await using var cmd = PostgresApprovalStore.Command(c, tx, "SELECT contract_id FROM qtkd.contract WHERE contract_id=@id FOR UPDATE", ("id", id));
            await cmd.ExecuteScalarAsync(ct);
            var stored = (await PostgresApprovalStore.Load(c, tx, document, ct))!;
            return await action(new PostgresApprovalTransaction(c, tx, stored.Document, stored.OwnerId));
        }
        public Task RetryNotifications(Guid document, CancellationToken ct) => throw new NotSupportedException();
    }
    private sealed class RollbackSessions(NpgsqlConnection c, NpgsqlTransaction tx) : IApprovalDbSessions
    {
        public Task<ApprovalDbSession> Open(bool write, CancellationToken ct) => Task.FromResult(new ApprovalDbSession(c, tx, false));
    }
}
