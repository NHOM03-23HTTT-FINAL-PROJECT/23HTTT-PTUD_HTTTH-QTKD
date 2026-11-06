# Database QTKD trên Supabase

## Cập nhật 04/11/2026: EF Core sở hữu schema

Từ ngày này, **EF Core quản lý migration của toàn bộ schema `qtkd`** và Prisma đã bị gỡ khỏi repo. Schema giữ nguyên: 32 bảng, gồm 26 bảng dictionary, 3 bảng Identity và 3 bảng vận hành hợp đồng (`contract_cancellation_request`, `contract_delivery`, `idempotency_request`), cùng 20 enum, CHECK, trigger, RLS và dữ liệu quyền ban đầu. Code hợp đồng/phê duyệt vẫn dùng SQL thô. Notifications dùng EF Core LINQ.

| Nội dung | Vị trí |
| --- | --- |
| DbContext sở hữu migration | `backend/src/QTKD.Infrastructure/Persistence/QtkdDbContext.cs` (`IdentityDbContext` chỉ map một phần cho Identity, không sinh migration) |
| Model bảng | `Persistence/Schema/` (entity, enum) và `Persistence/Configurations/<Module>/` |
| Migration | `Persistence/Migrations/`; SQL viết tay ở `Persistence/Migrations/Sql/` |
| Bảng lịch sử | `qtkd."__EFMigrationsHistory"` (`qtkd._prisma_migrations` giữ lại làm lịch sử) |
| Công cụ DB | `backend/src/QTKD.DbTool` (connection-check, status, adopt, migrate, seed) |
| Fixture demo | `Persistence/Seed/demo-seed.json` (chuyển nguyên từ `seed-data.ts`) |

**9 migration đầu** (`2026110x000x00_Prisma*`) là bản sao 1:1 của 9 migration Prisma cũ. Mỗi migration chạy đúng file SQL gốc, chỉ bỏ dòng `BEGIN;`/`COMMIT;` vì EF tự bọc transaction. `PrismaManagerRoles` chạy ngoài transaction vì giá trị enum mới phải commit trước khi dùng. Migration `*_EfHistoryRls` là migration EF đầu tiên: bật RLS cho bảng lịch sử EF, và snapshot của nó chứa model đầy đủ, nên các migration sau sinh tự động bằng `dotnet ef migrations add`.

Model EF mô tả bảng, cột, kiểu, default, PK/FK, index thường, sequence và enum. **CHECK, trigger, function, RLS, index biểu thức/partial** chỉ có trong SQL. Muốn đổi những phần này thì thêm `migrationBuilder.Sql(...)`, hoặc thêm file vào `Migrations/Sql` rồi gọi `MigrationSql.Run`. EF không biểu diễn được `ON UPDATE` của FK. FK cũ giữ nguyên `ON UPDATE RESTRICT/CASCADE` trong DB; FK mới sẽ là `NO ACTION`.

## Kiểm tra offline

Cần .NET SDK theo `backend/global.json`, công cụ `dotnet-ef` 10, và Node.js 22.18+ (nhánh 22) hoặc 24.11+. Chạy trong `DB/`:

```powershell
npm ci
npm run check
```

`check` gồm 3 phần, không phần nào kết nối Supabase:

- `npm test`: catalog quyền trong fixture khớp FE (`frontend/src/constants/roles.ts`), BE (`IdentityPolicies.cs`) và SQL grants.
- `npm run test:ef-parity`: dựng 2 PostgreSQL bằng PGlite (WASM). Một DB chạy các file SQL migration, một DB chạy DDL sinh từ model EF (`dotnet ef dbcontext script`). Sau đó so bảng, cột, PK/FK, index, sequence và enum. Phần chỉ có ở SQL phải nằm trong danh sách cho phép trong test.
- `npm run test:dbtool`: chạy `QTKD.DbTool` thật trên PGlite. Kịch bản 1 là DB trống: `migrate`, `seed` 2 lần (lần 2 không đổi gì, không reset mật khẩu), `status`. Kịch bản 2 là DB kiểu Prisma: `migrate` bị chặn, `adopt` 2 lần, rồi `migrate` chỉ chạy migration EF.

Thêm các lệnh sau:

- `npm run seed:check`: kiểm tra fixture offline.
- `npm run test:contracts`: E2E Api + PGlite.
- Trong `backend/`: `dotnet test` (gồm `DatabaseToolingTests`: validator seed, đối chiếu 239 cột dictionary, chặn URL, chẩn đoán lỗi kết nối) và `dotnet ef migrations has-pending-model-changes -p src/QTKD.Infrastructure -s src/QTKD.Infrastructure -c QtkdDbContext`.

PGlite là PostgreSQL thật nhưng không chứng minh hành vi riêng của Supabase (role `anon`/`authenticated`, pooler, TLS).

## Chạy với Supabase

Nếu kết nối lỗi, chạy `npm run connection:check` (chỉ `SELECT 1`, không ghi). Lệnh in mã lỗi an toàn, không in URI. Xem thêm [hướng dẫn TLS/CA](../docs/setup/DATABASE-TLS.md).

1. Trong **Supabase > Connect**, lấy URI **Direct connection** cổng 5432. Nếu mạng không hỗ trợ IPv6, dùng **Session pooler** cổng 5432. Không dùng Transaction pooler cổng 6543.
2. Dùng DB/.env nhận riêng từ nhóm, hoặc copy `.env.example`. Giữ `schema=qtkd` và `sslmode=verify-full`; URL-encode ký tự đặc biệt trong mật khẩu. Nếu `sslrootcert` là đường dẫn tương đối, nó được tính từ thư mục chứa `.env`, ví dụ `sslrootcert=./.env.supabase-ca.crt`. `SEED_PASSWORD` chỉ cần khi seed: tối thiểu 12 ký tự, tối đa 72 byte UTF-8.
3. Thành viên chỉ dùng DB chung thì chỉ chạy `npm run connection:check` và `npm run migrate:status`. Các lệnh ghi dưới đây dành cho người phụ trách DB.

**DB chung hiện có (do Prisma dựng), chỉ làm một lần:**

```powershell
npm run migrate:status   # báo "DB do Prisma dựng, chưa adopt"
npm run migrate:adopt    # kiểm tra đủ 9 dòng _prisma_migrations, ghi 9 id EF; không chạy DDL
npm run migrate:deploy   # chỉ chạy migration EF mới (EfHistoryRls)
npm run migrate:status   # 10 applied, 0 pending
```

`adopt` từ chối nếu `_prisma_migrations` thiếu một migration trong baseline, có migration lạ, hoặc có migration đã rollback. `migrate` từ chối DB Prisma chưa adopt, để không chạy lại DDL baseline.

**DB mới:** `npm run migrate:deploy`, rồi `npm run seed` nếu cần dữ liệu demo.

Các lệnh trên **kết nối và ghi lên Supabase thật**. Công cụ từ chối host local, URL mẫu và Transaction pooler. Riêng tùy chọn `--disposable-local` cho phép `127.0.0.1`, và chỉ dùng cho test PGlite. `.env` đã được Git ignore. Không commit password, service key hoặc connection string. Không dùng `dotnet ef database update` lên DB chung vì lệnh này bỏ qua bước kiểm tra adopt. Không chạy lại SQL thủ công.

Sau khi migrate/seed, dùng [scripts/verify-supabase.sql](scripts/verify-supabase.sql) để kiểm tra đọc.

## Thêm migration mới

### Customer flow trên cus-flow (05/11/2026)

Sau baseline của main, migration EF `20261105104547_CustomerFlow` bổ sung bốn bảng
`customer_profile_data`, `customer_operation`, `customer_status_outbox`, `customer_status_delegation`
và ba cột `customer_updated_at`, `flow_revision`, `review_metadata` vào hai bảng customer/decision.
Model/configuration, Designer và snapshot đã được cập nhật; CHECK/trigger/RLS nằm trong SQL của migration EF.
Không dùng ba migration Prisma khách hàng cũ. Số bảng ứng dụng là 36; sau migrate đầy đủ là 11 applied, 0 pending.

Migration không gán metadata tạo giả cho khách cũ; bảng vận hành mới không cần fixture giả.
Lịch sử Suspend được giữ để đọc/kích hoạt lại. SYS-CUS-03 được bổ sung lại ngày 06/11/2026,
dùng các bảng/cột/enum hiện có; lần bổ sung này không tạo migration hoặc sửa schema Supabase.
Down của migration mới từ chối xóa lịch sử; thay đổi tiếp bằng migration tiến.
Kết quả DB trống, nâng cấp từ main có dữ liệu, adopt, RLS và test nghiệp vụ ở
[báo cáo khách hàng](../docs/testing/test-cases/customers-main-ef.md).
Chỉ đã áp trên DB thử nghiệm riêng, chưa áp lên Supabase dùng chung.

Nếu một DB từng chạy các migration Prisma customer ngoài chín migration baseline, guard adopt vẫn từ chối;
cần đối chiếu riêng, không tự thêm lịch sử EF hoặc chạy DDL lần nữa.

Chạy trong `backend/`:

```powershell
dotnet ef migrations add <Ten> -p src/QTKD.Infrastructure -s src/QTKD.Infrastructure -c QtkdDbContext -o Persistence/Migrations
```

Sửa entity/configuration trước, rồi review file sinh ra. Thêm SQL cho CHECK/trigger/RLS nếu cần. Bảng mới phải bật RLS và thu hồi quyền `anon`/`authenticated` như các bảng khác. Sau đó chạy `npm run check` trong `DB/`.

Các module duyệt/hợp đồng ghi DB bằng SQL thô. Đổi tên cột/enum thì phải sửa cả những chỗ đó.

## File

| File | Vai trò |
| --- | --- |
| `data-dictionary/source-columns.json` | Bảng/cột/FK trích từ tài liệu nguồn; `DatabaseToolingTests` đối chiếu với model EF |
| `data-dictionary/baseline.prisma` | Bản schema gốc từ dictionary, chỉ để tham chiếu (không chạy) |
| `data-dictionary/DECISIONS.md` | Quyết định kiểu dữ liệu, ràng buộc, chuyển sang EF Core |
| `scripts/verify-supabase.sql` | Truy vấn đọc để kiểm tra sau migrate/seed |
| `scripts/bcrypt-interop.mjs` | Cầu nối bcryptjs cho test Identity của backend |
| `tests/*.mjs` | Test PGlite/E2E nêu trên |

## Dữ liệu demo

Dữ liệu thử phân công người duyệt (SYS-CTR-10): 3 hồ sơ "Chờ TP Kinh doanh / TP Pháp chế / Tổng Giám đốc phân công Demo" có lượt đang chạy với bước chưa có người duyệt; hồ sơ "Hợp đồng chờ rà soát Demo" có đủ người nên dùng để thử đổi người.

Seed có 6 phòng ban, 11 tài khoản thuộc 10 vai trò, khách hàng Active/Suspended, cây khu vực 3 cấp, dịch vụ, hợp đồng/phụ lục, bảng giá, sản lượng, thanh toán, lượt duyệt và phiên ký giả lập. Username dạng `demo.*`, email `example.invalid`; không có dữ liệu cá nhân thật. Fixture nằm trong `demo-seed.json` (tên bảng/cột thật). Seed .NET và test E2E dùng chung file này.

Tài khoản seed mới dùng bcrypt cost 12 từ `SEED_PASSWORD`, bật bắt buộc đổi mật khẩu. Chín tài khoản hiện có trên QTKD_DATH được bỏ bắt đổi lần đầu theo thao tác reset riêng ngày 02/11/2026 (xem [changelog Identity](../docs/specs/identity/CHANGELOG.md)), không thay đổi fixture tạo mới. Phiên đăng nhập mẫu đã thu hồi; OTP mẫu đã dùng và hết hạn. Grants ban đầu do migration `202611020003_identity` chèn; seed không khôi phục grants admin đã gỡ.

Đường dẫn `demo-placeholder/...` chỉ là metadata, không có file thật. Seed không upload Storage, gửi email hoặc gọi dịch vụ ký. Các trạng thái lịch sử Approved/Issued/Succeeded được nhập sẵn làm fixture, không phải kết quả đã chạy luồng nghiệp vụ.

Seed chạy trong một transaction: khóa advisory, `INSERT ... ON CONFLICT DO NOTHING` từng dòng, chỉ đặt `manager_id` khi còn trống, rồi kiểm tra ID. Natural key trùng với ID khác làm transaction thất bại. Đã kiểm tra seed chạy lại 2 lần trên PGlite; **chưa kiểm tra trên Supabase thật.**

Chưa coi các task/API Sprint 1/2/3 hoàn tất chỉ từ bộ schema này.

Contracts CRUD and cancellation integration: [setup](../backend/GETTING-STARTED.md).
