using Npgsql;
using QTKD.Application.Features.ContractApprovals;
using QTKD.Domain.Contracts;
using QTKD.Infrastructure.ContractApprovals;
using QTKD.Infrastructure.Persistence;
using Xunit;

namespace QTKD.IntegrationTests;

// Opt-in (QTKD_APPROVAL_ROLLBACK_CONNECTION). SYS-CTR-04 → 09 trên PostgreSQL thật: trình bằng SQL của module hợp đồng,
// rồi tiếp nhận, phân công, chấp thuận, bàn giao bằng module duyệt. Mọi thay đổi nằm trong một transaction và luôn rollback.
public sealed class SubmissionApprovalPostgresRollbackTests
{
    [ApprovalPostgresRollbackFact]
    public async Task Submitted_contract_runs_sales_legal_board_with_a_stable_version_then_rollback()
    {
        await using var connection = new NpgsqlConnection(Environment.GetEnvironmentVariable("QTKD_APPROVAL_ROLLBACK_CONNECTION"));
        await connection.OpenAsync();
        await using var transaction = await connection.BeginTransactionAsync();
        var ct = CancellationToken.None;
        var prefix = "submit.rollback." + Guid.NewGuid().ToString("N")[..12];
        async Task Exec(string sql, params (string Name, object? Value)[] args)
        {
            await using var cmd = PostgresApprovalStore.Command(connection, transaction, sql, args);
            await cmd.ExecuteNonQueryAsync();
        }
        async Task<object?> Scalar(string sql, params (string Name, object? Value)[] args)
        {
            await using var cmd = PostgresApprovalStore.Command(connection, transaction, sql, args);
            return await cmd.ExecuteScalarAsync();
        }
        try
        {
            // owner, TP KD, NV Pháp chế, TP Pháp chế, thành viên BGĐ, Tổng Giám đốc
            var people = new (string Role, string Dept)[] { ("SalesStaff", "KD"), ("SalesManager", "KD"), ("LegalStaff", "PC"),
                ("LegalManager", "PC"), ("BoardMember", "BGD"), ("BoardChair", "BGD") };
            var ids = people.Select(_ => Guid.NewGuid()).ToArray();
            for (var i = 0; i < people.Length; i++)
                await Exec("""
                    INSERT INTO qtkd.user_account(user_id,username,company_email,password_hash,full_name,department_id,role,status,failed_login_count,must_change_password,can_sign)
                    SELECT @id,@name,@email,'unused-test-hash',@name,department_id,@role::qtkd.user_role,'Active',0,false,false FROM qtkd.department WHERE code=@dept
                    """, ("id", ids[i]), ("name", prefix + "." + i), ("email", prefix + "." + i + "@example.invalid"), ("role", people[i].Role), ("dept", people[i].Dept));
            var (owner, salesHead, legalStaff, legalHead, boardMember, boardHead) = (ids[0], ids[1], ids[2], ids[3], ids[4], ids[5]);
            await Exec("UPDATE qtkd.department SET manager_id=@m WHERE code='KD'", ("m", salesHead));
            await Exec("UPDATE qtkd.department SET manager_id=@m WHERE code='PC'", ("m", legalHead));
            await Exec("UPDATE qtkd.department SET manager_id=@m WHERE code='BGD'", ("m", boardHead));
            var sales = (Guid)(await Scalar("SELECT department_id FROM qtkd.department WHERE code='KD'"))!;

            // Hồ sơ Nháp đủ điều kiện: một hạng mục ở khu vực gốc đang Hoạt động và một tệp đính kèm.
            var id = Guid.NewGuid();
            var code = (string)(await Scalar("""
                INSERT INTO qtkd.contract(contract_id,customer_id,title,contract_type,start_date,end_date,contract_value,payment_terms,content,status,owner_id,owning_department_id)
                SELECT @id,customer_id,@title,'Test',CURRENT_DATE,CURRENT_DATE+30,1000,'Payment','Content','Draft',@owner,@dept
                FROM qtkd.customer WHERE status='Active' ORDER BY customer_id LIMIT 1
                RETURNING contract_code
                """, ("id", id), ("title", prefix), ("owner", owner), ("dept", sales)))!;
            await Exec("""
                INSERT INTO qtkd.contract_item(contract_id,service_id,area_id,area_name_snapshot)
                SELECT @id,s.service_id,a.area_id,a.area_name FROM qtkd.service s, qtkd.area a
                WHERE a.status='Active' AND a.parent_area_id IS NULL ORDER BY s.service_id,a.area_id LIMIT 1
                """, ("id", id));
            await Exec("""
                INSERT INTO qtkd.attachment(record_type,contract_id,file_name,file_path,uploaded_by,content_type,file_size)
                VALUES('Contract',@id,'hop-dong.pdf','rollback/none',@owner,'application/pdf',1)
                """, ("id", id), ("owner", owner));

            var actor = new Actor(owner, "SalesStaff", sales, prefix);
            var contracts = new PostgresContractStore(null!, "");
            var submitted = await contracts.SubmitIn(connection, transaction, actor, code, ct);
            Assert.Equal("submitted", submitted["contract"]!["status"]!.GetValue<string>());

            var store = new RollbackStore(connection, transaction);
            var engine = new ContractApprovalEngine(store, new(), TimeProvider.System);
            var assignment = new ApprovalAssignmentService(new RollbackSessions(connection, transaction));
            async Task<ReviewDocument> Read() => (await store.Read(id, ct))!;
            async Task Act(string step, string action) => await engine.Execute(WorkflowEngineTests.Command(await Read(), step, action), ct);
            async Task Assign(Guid head, string step, Guid assignee)
            {
                var document = await Read();
                await assignment.Assign(head, id, new(document.RoundId, document.Steps.Single(s => s.Key == step).Id, document.Version, assignee), ct);
            }

            // Trình: bước đầu giao TP KD; Pháp chế và BGĐ chờ phân công; lượt ghi đúng version hiện tại.
            var document = await Read();
            Assert.Equal(("submitted", 1), (document.Status, document.RoundNo));
            Assert.Equal(["pending-accept", "unassigned", "unassigned"], document.Steps.Select(s => s.State));
            Assert.Equal(salesHead, document.Steps[0].AssigneeId);
            Assert.Equal(document.Version, document.SubmittedVersion);
            Assert.Equal(1L, await Scalar("SELECT count(*) FROM qtkd.notification WHERE record_id=@id AND recipient_id=@m", ("id", id), ("m", salesHead)));
            var twice = await Assert.ThrowsAsync<BusinessException>(() => contracts.SubmitIn(connection, transaction, actor, code, ct));
            Assert.Equal("STATUS", twice.Code);

            // A1: TP KD yêu cầu chỉnh sửa, người phụ trách trình lại → lượt 2 bắt đầu lại từ TP KD.
            await Act("sales", "accept");
            await Act("sales", "revision");
            Assert.Equal(("revision-requested", "revision"), ((await Read()).Status, (await Read()).RoundResult));
            await contracts.SubmitIn(connection, transaction, actor, code, ct);
            document = await Read();
            Assert.Equal(("submitted", 2), (document.Status, document.RoundNo));
            Assert.Equal(["pending-accept", "unassigned", "unassigned"], document.Steps.Select(s => s.State));

            await Act("sales", "accept");
            await Act("sales", "approve");
            Assert.Equal(["done", "unassigned", "unassigned"], (await Read()).Steps.Select(s => s.State));

            await Assign(legalHead, "legal", legalStaff);
            Assert.Equal("reviewing", (await Read()).Steps[1].State);
            await Assign(boardHead, "board", boardMember);
            await Act("legal", "approve");
            Assert.Equal(["done", "done", "waiting"], (await Read()).Steps.Select(s => s.State));
            await Act("legal", "handoff");
            await Act("board", "approve");

            var approved = await Read();
            Assert.Equal(("approved", "completed"), (approved.Status, approved.RoundResult));
            Assert.All(approved.Steps, s => Assert.Equal(("done", "approve"), (s.State, s.Decision)));
            Assert.Equal(approved.SubmittedVersion, approved.Version);
        }
        finally { await transaction.RollbackAsync(); }
        await using var cleanup = new NpgsqlCommand("SELECT count(*) FROM qtkd.user_account WHERE username LIKE @prefix", connection);
        cleanup.Parameters.AddWithValue("prefix", prefix + "%");
        Assert.Equal(0L, await cleanup.ExecuteScalarAsync());
    }

    private sealed class RollbackStore(NpgsqlConnection c, NpgsqlTransaction tx) : IApprovalStore
    {
        public Task<IReadOnlyList<ReviewDocument>> Inbox(ReviewActor actor, string step, bool done, CancellationToken ct) => throw new NotSupportedException();
        public async Task<ReviewDocument?> Read(Guid document, CancellationToken ct) => (await PostgresApprovalStore.Load(c, tx, document, ct))?.Document;
        public async Task<T> Locked<T>(Guid document, Func<IApprovalTransaction, Task<T>> action, CancellationToken ct)
        {
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
