using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Npgsql;
using NpgsqlTypes;
using QTKD.Application.Features.Customers;
using QTKD.Domain.Identity;
using QTKD.Infrastructure.Persistence;
using QTKD.Infrastructure.Identity;

namespace QTKD.Infrastructure.Customers;

// The database connection is deliberately the same configured backend identity
// connection; no request may choose a database, actor, department or owner.
public sealed partial class CustomerService(IdentityDbContext identity, IOptions<DatabaseOptions> database,
    IOptionsMonitor<TokenOptions> tokens, ICustomerStatusSource statusSource)
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);
    private static readonly HashSet<string> Groups = ["XNK", "HANG_TAU", "SAN_XUAT", "FORWARDER", "THUONG_MAI"];
    private static readonly HashSet<string> Services = ["LUU_KHO", "BOC_XEP", "VAN_CHUYEN_ND", "KHAI_THAC_CANG", "VAN_HANH_TB"];
    private const string VietnameseAccents = "àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ";
    private static readonly string VietnamesePlain = new string('a', 17) + new string('e', 11) + new string('i', 5)
        + new string('o', 17) + new string('u', 11) + new string('y', 5) + "d";
    private sealed record Actor(Guid Id, Guid DepartmentId, UserRole Role, string Name);
    private sealed record Row(Guid Id, string Name, string TaxCode, string Address, string Representative,
        string ContactName, string ContactTitle, string Phone, string Email, string Group, string[] Services,
        string Status, Guid OwnerId, string OwnerName, int Version, DateTime? CreatedAt, string? CreatedBy, DateTime? UpdatedAt, string Code,
        string? LegacyInterestedServices);

    private async Task<Actor> GetActor(Guid id, CancellationToken ct)
    {
        var actor = await (from u in identity.Users.AsNoTracking()
                           join d in identity.Departments.AsNoTracking() on u.DepartmentId equals d.DepartmentId
                           where u.UserId == id && u.Status == UserStatus.Active && d.Code == "KD"
                           select new Actor(u.UserId, u.DepartmentId, u.Role, u.FullName)).SingleOrDefaultAsync(ct);
        return actor ?? throw new CustomerFailure(403, "FORBIDDEN");
    }

    private NpgsqlConnection Connection() => new(database.Value.Identity);
    private static NpgsqlCommand Cmd(NpgsqlConnection c, NpgsqlTransaction? tx, string sql, params (string Name, object? Value)[] values)
    {
        var cmd = new NpgsqlCommand(sql, c, tx);
        foreach (var (name, value) in values) cmd.Parameters.AddWithValue(name, value ?? DBNull.Value);
        return cmd;
    }
    private static string ParseCode(string code) => Regex.IsMatch(code, "^KH-[0-9]{6,19}$", RegexOptions.CultureInvariant)
        ? code : throw new CustomerFailure(404, "NOT_FOUND");
    private async Task<Actor> AuthorizeMutation(NpgsqlConnection c, NpgsqlTransaction tx, Guid actorId, Guid sessionId, string permission, CancellationToken ct)
    {
        // Identity administration uses the same lock before changing role grants or
        // assignments. Lock the user too, matching logout/password-change ordering.
        await using (var administration = Cmd(c, tx, "SELECT pg_advisory_xact_lock_shared(22023)")) await administration.ExecuteNonQueryAsync(ct);
        Actor actor;
        await using (var command = Cmd(c, tx, """
            SELECT u.department_id,u.role::text,u.full_name FROM qtkd.user_account u
            JOIN qtkd.department d ON d.department_id=u.department_id
            WHERE u.user_id=@actor AND u.status='Active' AND NOT u.must_change_password AND d.code='KD'
              AND (u.locked_until IS NULL OR u.locked_until <= clock_timestamp())
              AND EXISTS (SELECT 1 FROM qtkd.role_permission p WHERE p.role=u.role AND p.permission_code=@permission)
              AND EXISTS (SELECT 1 FROM qtkd.role_permission p WHERE p.role=u.role AND p.permission_code='customers.view')
            FOR UPDATE OF u
            """, ("actor", actorId), ("permission", permission)))
        await using (var reader = await command.ExecuteReaderAsync(ct))
        {
            if (!await reader.ReadAsync(ct)) throw new CustomerFailure(403, "FORBIDDEN");
            actor = new Actor(actorId, reader.GetGuid(0), Enum.Parse<UserRole>(reader.GetString(1)), reader.GetString(2));
        }
        await using var session = Cmd(c, tx, """
            SELECT EXISTS (SELECT 1 FROM qtkd.login_session WHERE session_id=@session AND user_id=@actor AND NOT is_revoked
              AND expires_at > clock_timestamp() AND last_activity_at + make_interval(mins => @idle) > clock_timestamp())
            """, ("session", sessionId), ("actor", actorId), ("idle", tokens.CurrentValue.IdleMinutes));
        if ((bool)(await session.ExecuteScalarAsync(ct))! == false) throw new CustomerFailure(401, "SESSION_ENDED");
        return actor;
    }
    private static string Fold(string text)
    {
        var chars = text.Trim().ToLowerInvariant().Normalize(NormalizationForm.FormD)
            .Where(ch => CharUnicodeInfo.GetUnicodeCategory(ch) != UnicodeCategory.NonSpacingMark)
            .Select(ch => ch == 'đ' ? 'd' : ch).ToArray();
        return new string(chars).Normalize(NormalizationForm.FormC);
    }
    private const string SelectRows = """
        SELECT c.customer_id, c.customer_name, c.tax_code, c.address, c.legal_representative,
          coalesce(c.contact_name,''), coalesce(c.contact_title,''), coalesce(c.phone,''), coalesce(c.email,''),
          coalesce(c.customer_group,''), coalesce(p.service_groups, ARRAY[]::text[]), c.status::text,
          c.account_manager_id, owner.full_name, c.version, p.created_at, creator.full_name, c.customer_updated_at, c.customer_code, c.interested_services
        FROM qtkd.customer c
        JOIN qtkd.user_account owner ON owner.user_id = c.account_manager_id
        LEFT JOIN qtkd.customer_profile_data p ON p.customer_id = c.customer_id
        LEFT JOIN qtkd.user_account creator ON creator.user_id = p.created_by
        WHERE owner.department_id = @department
        """;
    private static Row ReadRow(NpgsqlDataReader r) => new(r.GetGuid(0), r.GetString(1), r.GetString(2), r.GetString(3),
        r.GetString(4), r.GetString(5), r.GetString(6), r.GetString(7), r.GetString(8), r.GetString(9),
        r.GetFieldValue<string[]>(10), r.GetString(11), r.GetGuid(12), r.GetString(13), r.GetInt32(14),
        r.IsDBNull(15) ? null : r.GetDateTime(15), r.IsDBNull(16) ? null : r.GetString(16),
        r.IsDBNull(17) ? null : r.GetDateTime(17), r.GetString(18), r.IsDBNull(19) ? null : r.GetString(19));

    private static async Task<Row> Find(NpgsqlConnection c, NpgsqlTransaction? tx, Actor actor, object idOrCode, bool forUpdate, CancellationToken ct)
    {
        var condition = idOrCode is Guid ? " AND c.customer_id = @id" : " AND c.customer_code = @id";
        await using var command = Cmd(c, tx, SelectRows + condition + (forUpdate ? " FOR UPDATE OF c" : ""),
            ("department", actor.DepartmentId), ("id", idOrCode));
        await using var reader = await command.ExecuteReaderAsync(ct);
        return await reader.ReadAsync(ct) ? ReadRow(reader) : throw new CustomerFailure(404, "NOT_FOUND");
    }
    private static void MayEdit(Actor actor, Row row)
    {
        if (actor.Role != UserRole.SalesManager && row.OwnerId != actor.Id) throw new CustomerFailure(403, "FORBIDDEN");
    }
    private static string Status(string status) => status == "Active" ? "active" : "suspended";
    private static async Task<CustomerView> View(NpgsqlConnection c, NpgsqlTransaction? tx, Row row, CancellationToken ct)
    {
        var history = new List<CustomerHistory>();
        await using (var cmd = Cmd(c, tx, "SELECT value_after::text FROM qtkd.audit_log WHERE entity_type='Customer' AND entity_id=@id AND action IN ('CUSTOMER_CREATED','CUSTOMER_UPDATED') ORDER BY acted_at, log_id", ("id", row.Id)))
        await using (var reader = await cmd.ExecuteReaderAsync(ct))
        {
            while (await reader.ReadAsync(ct))
            {
                if (!reader.IsDBNull(0))
                {
                    var item = JsonSerializer.Deserialize<CustomerHistory>(reader.GetString(0), Json);
                    if (item is not null) history.Add(item);
                }
            }
        }
        var decisions = new List<CustomerDecisionView>();
        await using (var cmd = Cmd(c, tx, """
            SELECT d.decision_type::text,d.reason,d.basis,d.follow_up_plan,u.full_name,d.decided_at
            FROM qtkd.customer_status_decision d JOIN qtkd.user_account u ON u.user_id=d.confirmed_by
            WHERE d.customer_id=@id ORDER BY d.decided_at,d.decision_id
            """, ("id", row.Id)))
        await using (var reader = await cmd.ExecuteReaderAsync(ct))
            while (await reader.ReadAsync(ct)) decisions.Add(new CustomerDecisionView(reader.GetString(0), reader.GetString(1),
                reader.IsDBNull(2) ? null : reader.GetString(2), reader.IsDBNull(3) ? null : reader.GetString(3), reader.GetString(4), reader.GetDateTime(5)));
        return new CustomerView(row.Code, row.Name, row.TaxCode, row.Address, row.Representative,
            row.ContactName, row.ContactTitle, row.Phone, row.Email, row.Group, row.Services, Status(row.Status),
            row.OwnerId, row.OwnerName, row.Version, row.CreatedAt, row.CreatedBy, history.ToArray(), row.LegacyInterestedServices, decisions.ToArray());
    }
    public async Task<CustomerView> Get(Guid actorId, string code, CancellationToken ct)
    {
        var actor = await GetActor(actorId, ct);
        await using var c = Connection(); await c.OpenAsync(ct);
        return await View(c, null, await Find(c, null, actor, ParseCode(code), false, ct), ct);
    }
    public async Task EnsureStatusScope(Guid actorId, string code, CancellationToken ct)
    {
        var actor = await GetActor(actorId, ct);
        await using var c = Connection(); await c.OpenAsync(ct);
        var row = await Find(c, null, actor, ParseCode(code), false, ct);
        MayEdit(actor, row);
    }
    public async Task<CustomerSearchResult> Search(Guid actorId, string? keyword, string? status, string? sort, int page, int size, CancellationToken ct)
    {
        if (page < 1 || !new[] { 8, 20, 50 }.Contains(size) || !new[] { "all", "active", "suspended" }.Contains(status)
            || !new[] { "updated-desc", "name-asc", "code-asc" }.Contains(sort) || (keyword?.Length ?? 0) > 200)
            throw new CustomerFailure(400, "INVALID_QUERY");
        var actor = await GetActor(actorId, ct);
        await using var c = Connection(); await c.OpenAsync(ct);
        await using var tx = await c.BeginTransactionAsync(System.Data.IsolationLevel.RepeatableRead, ct);
        var term = Fold(keyword ?? "");
        const string filters = """
            AND (@status = 'all' OR lower(c.status::text) = @status)
            AND (@keyword = '' OR position(@keyword IN translate(lower(c.customer_name), @accents, @plain)) > 0
              OR position(@keyword IN translate(lower(c.address), @accents, @plain)) > 0
              OR position(@keyword IN c.tax_code) > 0 OR position(@keyword IN lower(c.customer_code)) > 0)
            """;
        var order = sort switch
        {
            "name-asc" => "translate(lower(c.customer_name), @accents, @plain), c.customer_code",
            "code-asc" => "c.customer_code",
            _ => "c.customer_updated_at DESC NULLS LAST, c.customer_code"
        };
        var offset = ((long)page - 1) * size;
        var parameters = new (string, object?)[] { ("department", actor.DepartmentId), ("status", status), ("keyword", term),
            ("accents", VietnameseAccents), ("plain", VietnamesePlain), ("size", size), ("offset", offset) };
        await using var count = Cmd(c, tx, "SELECT count(*) FROM (" + SelectRows + " " + filters + ") matching", parameters);
        var total = Convert.ToInt32(await count.ExecuteScalarAsync(ct), CultureInfo.InvariantCulture);
        var items = new List<CustomerListItem>();
        await using (var cmd = Cmd(c, tx, SelectRows + " " + filters + " ORDER BY " + order + " LIMIT @size OFFSET @offset", parameters))
        await using (var reader = await cmd.ExecuteReaderAsync(ct))
            while (await reader.ReadAsync(ct))
            {
                var r = ReadRow(reader);
                items.Add(new CustomerListItem(r.Code, r.Name, r.Address, r.TaxCode, Status(r.Status), r.UpdatedAt));
            }
        await tx.CommitAsync(ct);
        return new CustomerSearchResult(items.ToArray(), total, page, size);
    }

    private static CustomerDraft Validate(CustomerDraft? draft, string? taxCode = null, string? legacyGroup = null)
    {
        if (draft is null) throw new CustomerFailure(400, "VALIDATION");
        static string Clean(string? s) => (s ?? "").Trim();
        var d = draft with { Name = Clean(draft.Name), TaxCode = Clean(taxCode ?? draft.TaxCode), Address = Clean(draft.Address),
            Representative = Clean(draft.Representative), ContactName = Clean(draft.ContactName), ContactTitle = Clean(draft.ContactTitle),
            Phone = Clean(draft.Phone), Email = Clean(draft.Email), CustomerGroup = Clean(draft.CustomerGroup),
            ServiceGroups = draft.ServiceGroups ?? [] };
        if (d.Name.Length is < 1 or > 250 || d.Address.Length is < 1 or > 5000 || d.Representative.Length is < 1 or > 200
            || !Regex.IsMatch(d.TaxCode, "^(?:[0-9]{10}|[0-9]{13})$") || d.ContactName.Length > 200 || d.ContactTitle.Length > 150
            || d.Phone.Length > 30 || d.Email.Length > 254 || (d.Phone.Length == 0 && d.Email.Length == 0)
            || (d.Phone.Length > 0 && !Regex.IsMatch(d.Phone, "^\\+?[0-9]+$"))
            || (d.Email.Length > 0 && !Regex.IsMatch(d.Email, "^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$"))
            || (d.CustomerGroup.Length > 0 && !Groups.Contains(d.CustomerGroup) && d.CustomerGroup != legacyGroup)
            || d.ServiceGroups.Length > Services.Count || d.ServiceGroups.Any(s => s is null || !Services.Contains(s))
            || d.ServiceGroups.Distinct(StringComparer.Ordinal).Count() != d.ServiceGroups.Length)
            throw new CustomerFailure(400, "VALIDATION");
        return d;
    }
    private static void Key(string key)
    {
        if (string.IsNullOrWhiteSpace(key) || key.Length > 100 || key.Any(ch => ch < 33 || ch > 126))
            throw new CustomerFailure(400, "IDEMPOTENCY_KEY_REQUIRED");
    }
    private static string Hash(object request) => Convert.ToHexString(SHA256.HashData(JsonSerializer.SerializeToUtf8Bytes(request, Json)));
    private static async Task LockKey(NpgsqlConnection c, NpgsqlTransaction tx, Guid actor, string operation, string key, CancellationToken ct)
    {
        await using var cmd = Cmd(c, tx, "SELECT pg_advisory_xact_lock(hashtextextended(@key, 0))", ("key", $"customer:{actor}:{operation}:{key}"));
        await cmd.ExecuteNonQueryAsync(ct);
    }
    private static async Task<(Guid Id, string Json)?> Receipt(NpgsqlConnection c, NpgsqlTransaction tx, Guid actor, string operation, string key, string hash, CancellationToken ct)
    {
        await using var cmd = Cmd(c, tx, "SELECT customer_id, request_hash, response::text FROM qtkd.customer_operation WHERE actor_id=@actor AND operation=@operation AND request_key=@key",
            ("actor", actor), ("operation", operation), ("key", key));
        await using var r = await cmd.ExecuteReaderAsync(ct);
        if (!await r.ReadAsync(ct)) return null;
        if (r.GetString(1) != hash) throw new CustomerFailure(409, "IDEMPOTENCY_KEY_REUSED");
        return (r.GetGuid(0), r.GetString(2));
    }
    private static async Task SaveReceipt(NpgsqlConnection c, NpgsqlTransaction tx, Guid actor, string operation, string key, string hash, Guid customer, object response, CancellationToken ct)
    {
        await using var cmd = Cmd(c, tx, "INSERT INTO qtkd.customer_operation(actor_id,operation,request_key,request_hash,customer_id,response) VALUES (@actor,@operation,@key,@hash,@customer,@response)",
            ("actor", actor), ("operation", operation), ("key", key), ("hash", hash), ("customer", customer));
        cmd.Parameters.AddWithValue("response", NpgsqlDbType.Jsonb, JsonSerializer.Serialize(response, Json));
        await cmd.ExecuteNonQueryAsync(ct);
    }
    private static async Task Audit(NpgsqlConnection c, NpgsqlTransaction tx, Guid actor, Guid customer, string action, CustomerHistory history, CancellationToken ct)
    {
        await using var cmd = Cmd(c, tx, "INSERT INTO qtkd.audit_log(entity_type,entity_id,action,actor_id,acted_at,value_after,note) VALUES ('Customer',@customer,@action,@actor,@at,@history,@note)",
            ("customer", customer), ("action", action), ("actor", actor), ("at", history.At), ("note", history.Reason));
        cmd.Parameters.AddWithValue("history", NpgsqlDbType.Jsonb, JsonSerializer.Serialize(history, Json));
        await cmd.ExecuteNonQueryAsync(ct);
    }

    public async Task<CreateCustomerResult> Create(Guid actorId, Guid sessionId, string key, CreateCustomerRequest request, CancellationToken ct)
    {
        Key(key); var hash = Hash(request);
        await using var c = Connection(); await c.OpenAsync(ct); await using var tx = await c.BeginTransactionAsync(ct);
        var actor = await AuthorizeMutation(c, tx, actorId, sessionId, "customers.create", ct);
        await LockKey(c, tx, actorId, "create", key, ct);
        var receipt = await Receipt(c, tx, actorId, "create", key, hash, ct);
        if (receipt is not null)
        {
            await Find(c, tx, actor, receipt.Value.Id, false, ct);
            var replay = JsonSerializer.Deserialize<CreateCustomerResult>(receipt.Value.Json, Json)!;
            return replay with { Replayed = true };
        }
        var d = Validate(request.Draft);
        Guid id;
        try
        {
            await using var insert = Cmd(c, tx, """
                INSERT INTO qtkd.customer(customer_name,tax_code,address,legal_representative,contact_name,contact_title,phone,email,customer_group,account_manager_id,customer_updated_at)
                VALUES (@name,@tax,@address,@representative,@contact,@title,@phone,@email,@group,@actor,clock_timestamp()) RETURNING customer_id
                """, ("name", d.Name), ("tax", d.TaxCode), ("address", d.Address), ("representative", d.Representative),
                ("contact", d.ContactName), ("title", d.ContactTitle), ("phone", d.Phone), ("email", d.Email), ("group", d.CustomerGroup), ("actor", actorId));
            id = (Guid)(await insert.ExecuteScalarAsync(ct))!;
        }
        catch (PostgresException e) when (e.SqlState == PostgresErrorCodes.UniqueViolation) { throw new CustomerFailure(409, "DUPLICATE_TAX_CODE"); }
        await using (var profile = Cmd(c, tx, "INSERT INTO qtkd.customer_profile_data(customer_id,service_groups,created_at,created_by,updated_at) VALUES (@id,@groups,clock_timestamp(),@actor,clock_timestamp())",
            ("id", id), ("groups", d.ServiceGroups), ("actor", actorId))) await profile.ExecuteNonQueryAsync(ct);
        var row = await Find(c, tx, actor, id, false, ct);
        await Audit(c, tx, actorId, id, "CUSTOMER_CREATED", new CustomerHistory("Tạo hồ sơ khách hàng", row.OwnerName, DateTime.UtcNow, row.Version), ct);
        var response = new CreateCustomerResult(await View(c, tx, row, ct), false);
        await SaveReceipt(c, tx, actorId, "create", key, hash, id, response, ct);
        await tx.CommitAsync(ct); return response;
    }

    public async Task<UpdateCustomerResult> Update(Guid actorId, Guid sessionId, string code, string key, UpdateCustomerRequest request, CancellationToken ct)
    {
        Key(key); var customerCode = ParseCode(code); var hash = Hash(request);
        if (request.Draft?.TaxCode is not null) throw new CustomerFailure(400, "IMMUTABLE_FIELD");
        await using var c = Connection(); await c.OpenAsync(ct); await using var tx = await c.BeginTransactionAsync(ct);
        var actor = await AuthorizeMutation(c, tx, actorId, sessionId, "customers.update", ct);
        await LockKey(c, tx, actorId, "update", key, ct);
        var row = await Find(c, tx, actor, customerCode, true, ct); MayEdit(actor, row);
        var id = row.Id;
        var receipt = await Receipt(c, tx, actorId, "update", key, hash, ct);
        if (receipt is not null)
        {
            if (receipt.Value.Id != id) throw new CustomerFailure(409, "IDEMPOTENCY_KEY_REUSED");
            return JsonSerializer.Deserialize<UpdateCustomerResult>(receipt.Value.Json, Json)! with { Replayed = true };
        }
        if (request.BaseVersion != row.Version)
            throw new CustomerFailure(409, "CONFLICT", new { latest = await View(c, tx, row, ct) });
        var reason = (request.Reason ?? "").Trim();
        if (reason.Length is < 1 or > 5000) throw new CustomerFailure(400, "VALIDATION");
        var d = Validate(request.Draft, row.TaxCode, row.Group);
        var changes = new List<CustomerChange>();
        void Change(string field, string before, string after) { if (before != after) changes.Add(new(field, before, after)); }
        Change("name", row.Name, d.Name!); Change("address", row.Address, d.Address!); Change("representative", row.Representative, d.Representative!);
        Change("contactName", row.ContactName, d.ContactName!); Change("contactTitle", row.ContactTitle, d.ContactTitle!);
        Change("phone", row.Phone, d.Phone!); Change("email", row.Email, d.Email!); Change("customerGroup", row.Group, d.CustomerGroup!);
        if (!row.Services.SequenceEqual(d.ServiceGroups!)) changes.Add(new("serviceGroups", row.Services, d.ServiceGroups!));
        if (changes.Count == 0) throw new CustomerFailure(400, "NO_CHANGES");
        await using (var update = Cmd(c, tx, """
            UPDATE qtkd.customer SET customer_name=@name,address=@address,legal_representative=@representative,contact_name=@contact,
              contact_title=@title,phone=@phone,email=@email,customer_group=@group,customer_updated_at=clock_timestamp(),flow_revision=flow_revision+1
            WHERE customer_id=@id
            """, ("name", d.Name), ("address", d.Address), ("representative", d.Representative), ("contact", d.ContactName),
            ("title", d.ContactTitle), ("phone", d.Phone), ("email", d.Email), ("group", d.CustomerGroup), ("id", id))) await update.ExecuteNonQueryAsync(ct);
        await using (var profile = Cmd(c, tx, """
            INSERT INTO qtkd.customer_profile_data(customer_id,service_groups,updated_at) VALUES (@id,@groups,clock_timestamp())
            ON CONFLICT(customer_id) DO UPDATE SET service_groups=EXCLUDED.service_groups,updated_at=EXCLUDED.updated_at
            """, ("id", id), ("groups", d.ServiceGroups))) await profile.ExecuteNonQueryAsync(ct);
        var updated = await Find(c, tx, actor, id, false, ct);
        await Audit(c, tx, actorId, id, "CUSTOMER_UPDATED", new CustomerHistory("Cập nhật thông tin", actor.Name, DateTime.UtcNow,
            updated.Version, row.Version, reason, changes.ToArray()), ct);
        var response = new UpdateCustomerResult(await View(c, tx, updated, ct), changes.Select(x => x.Field).ToArray(), false);
        await SaveReceipt(c, tx, actorId, "update", key, hash, id, response, ct);
        await tx.CommitAsync(ct); return response;
    }
}
