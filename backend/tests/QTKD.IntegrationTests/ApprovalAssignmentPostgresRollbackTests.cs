using System.Text.Json;
using Npgsql;
using QTKD.Application.Features.ContractApprovals;
using QTKD.Infrastructure.ContractApprovals;
using Xunit;

namespace QTKD.IntegrationTests;

// Opt-in (QTKD_APPROVAL_ROLLBACK_CONNECTION). Kiểm tra SQL phân công và trigger cho đổi người trên PostgreSQL thật.
// Cần DB test đã chạy migration 202611030003_approval_assignment; mọi thay đổi nằm trong một transaction và luôn rollback.
public sealed class ApprovalAssignmentPostgresRollbackTests
{
    [ApprovalPostgresRollbackFact]
    public async Task Department_heads_assign_and_reassign_only_their_steps_then_rollback()
    {
        await using var connection = new NpgsqlConnection(Environment.GetEnvironmentVariable("QTKD_APPROVAL_ROLLBACK_CONNECTION"));
        await connection.OpenAsync();
        await using var transaction = await connection.BeginTransactionAsync();
        var ct = CancellationToken.None;
        var prefix = "assign.rollback." + Guid.NewGuid().ToString("N")[..12];
        async Task Exec(string sql, params (string Name, object? Value)[] args)
        {
            await using var cmd = PostgresApprovalStore.Command(connection, transaction, sql, args);
            await cmd.ExecuteNonQueryAsync();
        }
        try
        {
            await using (var applied = PostgresApprovalStore.Command(connection, transaction, "SELECT EXISTS(SELECT 1 FROM qtkd.permission WHERE code='approvals.assign')"))
                Assert.True((bool)(await applied.ExecuteScalarAsync())!, "Apply migration 202611030003_approval_assignment to the test DB first.");

            // owner, TP KD, NV Pháp chế, TP Pháp chế, Tổng Giám đốc
            var people = new (string Role, string Dept)[] { ("SalesStaff", "KD"), ("SalesManager", "KD"), ("LegalStaff", "PC"), ("LegalManager", "PC"), ("BoardChair", "BGD") };
            var ids = people.Select(_ => Guid.NewGuid()).ToArray();
            for (var i = 0; i < people.Length; i++)
                await Exec("""
                    INSERT INTO qtkd.user_account(user_id,username,company_email,password_hash,full_name,department_id,role,status,failed_login_count,must_change_password,can_sign)
                    SELECT @id,@name,@email,'unused-test-hash',@name,department_id,@role::qtkd.user_role,'Active',0,false,false FROM qtkd.department WHERE code=@dept
                    """, ("id", ids[i]), ("name", prefix + "." + i), ("email", prefix + "." + i + "@example.invalid"), ("role", people[i].Role), ("dept", people[i].Dept));
            var (owner, salesHead, legalStaff, legalHead, boardHead) = (ids[0], ids[1], ids[2], ids[3], ids[4]);
            await Exec("UPDATE qtkd.department SET manager_id=@m WHERE code='KD'", ("m", salesHead));
            await Exec("UPDATE qtkd.department SET manager_id=@m WHERE code='PC'", ("m", legalHead));
            await Exec("UPDATE qtkd.department SET manager_id=@m WHERE code='BGD'", ("m", boardHead));

            var id = Guid.NewGuid(); var round = Guid.NewGuid();
            await Exec("""
                INSERT INTO qtkd.contract(contract_id,customer_id,title,contract_type,start_date,end_date,contract_value,payment_terms,content,status,owner_id,version,created_at,updated_at)
                SELECT @id,customer_id,@title,'Test',CURRENT_DATE,CURRENT_DATE+30,1000,'Payment','Content','Submitted',@owner,1,now(),now()
                FROM qtkd.customer ORDER BY customer_id LIMIT 1
                """, ("id", id), ("title", prefix), ("owner", owner));
            await Exec("""
                INSERT INTO qtkd.approval_round(round_id,record_type,contract_id,record_version,round_no,submitted_by,submitted_at,result,record_snapshot)
                VALUES(@round,'Contract',@id,1,1,@owner,now(),'Running',@snapshot::jsonb)
                """, ("round", round), ("id", id), ("owner", owner),
                ("snapshot", JsonSerializer.Serialize(new { workflow = new { version = 1, stages = new[] { "SalesManager", "LegalStaff", "BoardMember" } } })));
            for (var i = 0; i < 3; i++)
                await Exec("INSERT INTO qtkd.approval_step(step_id,round_id,step_name,step_order,step_status) VALUES(gen_random_uuid(),@round,@name,@order,'NotStarted')",
                    ("round", round), ("name", AssignmentRules.StepLabel(AssignmentRules.StepKeys[i])), ("order", i + 1));

            var service = new ApprovalAssignmentService(new RollbackSessions(connection, transaction));
            ReviewDocument document = (await PostgresApprovalStore.Load(connection, transaction, id, ct))!.Document;
            AssignReviewRequest Request(string step, Guid assignee) =>
                new(document.RoundId, document.Steps.Single(s => s.Key == step).Id, document.Version, assignee);

            // Tab phân công: mỗi trưởng bộ phận chỉ thấy bước của mình.
            Assert.Equal(["sales"], (await service.Board(salesHead, ct)).Single(item => item.Document.Id == id).ManagedSteps);
            Assert.Equal(["legal"], (await service.Board(legalHead, ct)).Single(item => item.Document.Id == id).ManagedSteps);
            Assert.DoesNotContain(await service.Candidates(salesHead, id, "sales", ct), c => c.Id == owner);

            // TP KD gán bước đầu → kích hoạt chờ tiếp nhận.
            document = await service.Assign(salesHead, id, Request("sales", salesHead), ct);
            Assert.Equal(("pending-accept", salesHead), (document.Steps[0].State, document.Steps[0].AssigneeId!.Value));

            // Trưởng Pháp chế không được phân công bước kinh doanh; người lập không được duyệt.
            var foreign = await Assert.ThrowsAsync<ReviewFailure>(() => service.Assign(legalHead, id, Request("sales", salesHead), ct));
            Assert.Equal("FORBIDDEN", foreign.Code);
            var drafter = await Assert.ThrowsAsync<ReviewFailure>(() => service.Assign(legalHead, id, Request("legal", owner), ct));
            Assert.Equal("INVALID_ASSIGNEE", drafter.Code);

            // Trưởng Pháp chế gán rồi đổi người khi bước chưa tới lượt.
            document = await service.Assign(legalHead, id, Request("legal", legalStaff), ct);
            Assert.Equal(("waiting", legalStaff), (document.Steps[1].State, document.Steps[1].AssigneeId!.Value));
            document = await service.Assign(legalHead, id, Request("legal", legalHead), ct);
            Assert.Equal(legalHead, document.Steps[1].AssigneeId);

            // Bước đã tiếp nhận thì không đổi người được.
            await Exec("UPDATE qtkd.approval_step SET step_status='Reviewing',accepted_at=now() WHERE step_id=@s", ("s", document.Steps[0].Id));
            document = (await PostgresApprovalStore.Load(connection, transaction, id, ct))!.Document;
            var started = await Assert.ThrowsAsync<ReviewFailure>(() => service.Assign(salesHead, id, Request("sales", Guid.NewGuid()), ct));
            Assert.Equal("ASSIGNMENT_IMMUTABLE", started.Code);

            await using var notifications = PostgresApprovalStore.Command(connection, transaction,
                "SELECT count(*) FROM qtkd.notification WHERE record_id=@id", ("id", id));
            Assert.Equal(4L, await notifications.ExecuteScalarAsync()); // 3 lần gán + 1 thông báo người bị thay
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
