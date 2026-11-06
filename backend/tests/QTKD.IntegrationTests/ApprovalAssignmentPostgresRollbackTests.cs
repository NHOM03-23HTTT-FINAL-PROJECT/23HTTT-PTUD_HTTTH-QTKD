using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;
using Npgsql;
using QTKD.Application.Features.ContractApprovals;
using QTKD.Domain.Contracts;
using QTKD.Infrastructure.ContractApprovals;
using QTKD.Infrastructure.Persistence;
using QTKD.Infrastructure.Repositories;
using Xunit;

namespace QTKD.IntegrationTests;

public sealed class ApprovalAssignmentPostgresRollbackTests
{
    [ApprovalPostgresRollbackFact]
    public async Task Department_heads_assign_and_reassign_only_legal_and_board_steps_then_rollback()
    {
        await using var db = new QtkdDbContext(QtkdPersistence.Options(Environment.GetEnvironmentVariable("QTKD_APPROVAL_ROLLBACK_CONNECTION")!));
        await db.Database.OpenConnectionAsync();
        await using var efTransaction = await db.Database.BeginTransactionAsync();
        var connection = (NpgsqlConnection)db.Database.GetDbConnection();
        var transaction = (NpgsqlTransaction)efTransaction.GetDbTransaction();
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
                Assert.True((bool)(await applied.ExecuteScalarAsync())!, "Apply all migrations to the test DB first.");

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
            await Exec("""
                INSERT INTO qtkd.approval_step(step_id,round_id,step_name,step_order,assignee_id,assigned_at,step_status)
                VALUES(gen_random_uuid(),@round,'Rà soát kinh doanh',1,@sales,now(),'Pending')
                """, ("round", round), ("sales", salesHead));
            for (var i = 0; i < 2; i++)
                await Exec("INSERT INTO qtkd.approval_step(step_id,round_id,step_name,step_order,step_status) VALUES(gen_random_uuid(),@round,@name,@order,'NotStarted')",
                    ("round", round), ("name", AssignmentRules.StepLabel(AssignmentRules.StepKeys[i])), ("order", i + 2));

            var service = new ApprovalAssignmentService(new ApprovalAssignmentRepository(db));
            static Actor As(Guid user) => new(user, "", Guid.Empty, "");
            ReviewDocument document = (await PostgresApprovalStore.Load(connection, transaction, id, ct))!.Document;
            AssignReviewRequest Request(string step, Guid assignee) =>
                new(document.RoundId, document.Steps.Single(s => s.Key == step).Id, document.Version, assignee);

            Assert.DoesNotContain(await service.Board(As(salesHead), ct), item => item.Document.Id == id);
            Assert.Equal(["legal"], (await service.Board(As(legalHead), ct)).Single(item => item.Document.Id == id).ManagedSteps);
            Assert.Equal(["board"], (await service.Board(As(boardHead), ct)).Single(item => item.Document.Id == id).ManagedSteps);
            Assert.DoesNotContain(await service.Candidates(As(legalHead), id, "legal", ct), c => c.Id == owner);

            var foreign = await Assert.ThrowsAsync<BusinessException>(() => service.Assign(As(legalHead), id, Request("sales", legalStaff), ct));
            Assert.Equal("FORBIDDEN", foreign.Code);
            var drafter = await Assert.ThrowsAsync<BusinessException>(() => service.Assign(As(legalHead), id, Request("legal", owner), ct));
            Assert.Equal("INVALID_ASSIGNEE", drafter.Code);

            document = await service.Assign(As(legalHead), id, Request("legal", legalStaff), ct);
            Assert.Equal(("waiting", legalStaff), (document.Steps[1].State, document.Steps[1].AssigneeId!.Value));
            document = await service.Assign(As(legalHead), id, Request("legal", legalHead), ct);
            Assert.Equal(legalHead, document.Steps[1].AssigneeId);
            document = await service.Assign(As(boardHead), id, Request("board", boardHead), ct);
            Assert.Equal(("waiting", boardHead), (document.Steps[2].State, document.Steps[2].AssigneeId!.Value));

            await Exec("UPDATE qtkd.approval_step SET step_status='Completed',decision='Approve',decided_by=@m,decided_at=now(),accepted_at=now() WHERE step_id=@s",
                ("m", salesHead), ("s", document.Steps[0].Id));
            await Exec("UPDATE qtkd.approval_step SET step_status='Reviewing',accepted_at=now() WHERE step_id=@s", ("s", document.Steps[1].Id));
            document = (await PostgresApprovalStore.Load(connection, transaction, id, ct))!.Document;
            var started = await Assert.ThrowsAsync<BusinessException>(() => service.Assign(As(legalHead), id, Request("legal", legalStaff), ct));
            Assert.Equal("ASSIGNMENT_IMMUTABLE", started.Code);

            await using var notifications = PostgresApprovalStore.Command(connection, transaction,
                "SELECT count(*) FROM qtkd.notification WHERE record_id=@id", ("id", id));
            Assert.Equal(4L, await notifications.ExecuteScalarAsync());
        }
        finally { await efTransaction.RollbackAsync(); }
        await using var cleanup = new NpgsqlCommand("SELECT count(*) FROM qtkd.user_account WHERE username LIKE @prefix", connection);
        cleanup.Parameters.AddWithValue("prefix", prefix + "%");
        Assert.Equal(0L, await cleanup.ExecuteScalarAsync());
    }
}
