# Database QTKD trên Supabase

## Cập nhật TASK-022/023 ngày 02/11/2026

Giữ nguyên 26 bảng từ dictionary và hai migration cũ, bổ sung ba bảng role_definition/permission/role_permission cùng metadata Identity trong migration `202611020003_identity`. Schema hiện có 29 model. Một role bắt buộc; grants có thể rỗng. Nguồn dictionary 239 cột vẫn được giữ trong source-columns.json để đối chiếu, không sửa nguồn nghiệp vụ thành quyết định mới.

Nhận DB/.env qua kênh bảo mật của nhóm và đặt CA tại DB/.env.supabase-ca.crt nếu dùng file CA riêng. Chạy connection:check và migrate:status từ DB/ để biết trạng thái DB đích. Thành viên pull code dùng DB chung đã chuẩn bị không cần tự deploy/seed. Số bảng và migration trong tài liệu mô tả schema mục tiêu; không thay thế kiểm tra môi trường thực tế. Integration/replay/seed hai lần trên PostgreSQL test riêng vẫn chưa có bằng chứng PASS đầy đủ.

Ma trận ban đầu nằm trong `prisma/identity-catalog.ts`, được bootstrap bằng migration; seed không khôi phục grants admin đã gỡ. Native checks không cần dependencies: `node --experimental-transform-types --test tests/identity-offline.test.mjs`. Đây là kiểm tra nguồn/mapping, không thực thi PostgreSQL. `npm run check` cần cài dependencies và vẫn không chứng minh migration chạy được trên DB thật.

Bộ Prisma độc lập này dựng toàn bộ **26 bảng, 239 cột còn hiệu lực, 59 khóa ngoại** trong `data-dictionary.md` được cung cấp ngày 02/11/2026, đối chiếu `spec nghiệp vụ + hệ thống (8).docx`. DB đích là PostgreSQL trên Supabase; không dùng PostgreSQL/Docker local. Backend ứng dụng vẫn là C#/.NET Web API.

Kiểm tra offline không chứng minh trigger, RLS, transaction hay việc chạy lại seed đã hoạt động trên PostgreSQL thật. Chín tài khoản demo trên DB chung đã được reset theo phê duyệt riêng, xem [changelog Identity](../docs/specs/identity/CHANGELOG.md); thao tác đó không phải hành vi tự động của seed.

## Kiểm tra khi chưa có DB

Cần Node.js 22.18+ thuộc nhánh 22, hoặc 24.11+. Prisma được khóa ở bản ổn định 7.10.1. Chạy trong thư mục `DB/`:

```powershell
npm ci
npm run check
```

`check` validate schema, sinh Prisma Client, kiểm tra TypeScript, chạy test fixture, dry-run seed và đối chiếu migration với schema. Không mở kết nối DB. Lần đầu cài dependency/generate có thể cần mạng để tải package/engine.

`npm run seed:check` chỉ kiểm tra dữ liệu seed. URL `.invalid` trong `prisma.config.ts` chỉ giúp các lệnh offline đọc cấu hình; không phải DB local hoặc DB có thể kết nối.

Generator `prisma-client` xuất `generated/prisma/client.ts`, không phải client.js. Repo import trực tiếp `.ts` và đặt importFileExtension=ts cho tsx. `npm run seed` tự chạy generate qua preseed; nếu gọi `npx prisma db seed` hoặc `npm run seed:check` trực tiếp thì chạy `npm run generate` trước. Dùng Node 24 LTS theo hướng dẫn local; cảnh báo DEP0205 trên Node 26 không phải lỗi thiếu Prisma Client.

## Chạy khi đã có project Supabase

Nếu seed lỗi P1011, chạy `npm run connection:check` để kiểm tra kết nối bằng SELECT 1 mà không ghi dữ liệu. Xem [hướng dẫn TLS/CA và mã lỗi](../docs/setup/DATABASE-TLS.md). Khuyến nghị sslmode=verify-full; khi cần CA, dùng sslrootcert trỏ file tải từ Supabase Database Settings.

1. Trong **Supabase > Connect**, lấy URI **Direct connection** cổng 5432. Nếu mạng không hỗ trợ IPv6, dùng **Session pooler** cổng 5432. Không dùng Transaction pooler cổng 6543 cho migration.
2. Dùng DB/.env nhận riêng từ nhóm, hoặc copy .env.example nếu dựng DB riêng. Giữ `schema=qtkd` và `sslmode=verify-full`; URL-encode ký tự đặc biệt trong mật khẩu. Khi CA nằm cùng .env, dùng `sslrootcert=./.env.supabase-ca.crt` và chạy lệnh từ DB/. Đặt SEED_PASSWORD riêng cho demo khi tạo mới, tối thiểu 12 ký tự, tối đa 72 byte UTF-8.
3. Trên DB chung đã chuẩn bị, chỉ chạy `npm run connection:check` và `npm run migrate:status`. Phần ghi dữ liệu sau dành cho người phụ trách dựng DB mới hoặc cập nhật schema đã được nhóm thống nhất, chạy từ `DB/`:

```powershell
npm run migrate:status
npm run migrate:deploy
npm run seed
```

Các lệnh này **kết nối/ghi lên Supabase thật**. Wrapper từ chối host local, URL mẫu và Transaction pooler. `.env` đã được Git ignore. API URL/anon key không thay thế PostgreSQL connection URI; không commit password, service key hoặc connection string.

Trong Table Editor chọn schema **qtkd**. Bộ migration tạo bảng trong database `postgres` sẵn có, không chạy `CREATE DATABASE` và không sửa schema `auth`/`storage`. Không dùng `migrate reset`, `db push` hoặc áp dụng lại SQL thủ công trên DB dùng chung. Prisma Migrate quản lý lịch sử áp dụng.

Sau khi migrate/seed, dùng [scripts/verify-supabase.sql](scripts/verify-supabase.sql) để kiểm tra đọc. Script này hiện chưa chạy trên Supabase.

## File và quyền sở hữu schema

| File | Vai trò |
| --- | --- |
| `prisma/schema.prisma` | Nguồn cấu trúc 29 model (26 dictionary + 3 Identity) và 20 enum |
| `prisma.config.ts` | Cấu hình CLI và lệnh seed |
| `prisma/migrations/202611020001_dictionary/migration.sql` | DDL sinh offline, bọc transaction và đặt search path `qtkd` |
| `prisma/migrations/202611020002_constraints/migration.sql` | CHECK, index có điều kiện, trigger và RLS |
| `prisma/seed-data.ts` | Fixture có ID cố định và snapshot riêng |
| `prisma/seed.ts` | Dry-run hoặc seed trong một transaction |
| `data-dictionary/source-columns.json` | Coverage trích từ bảng/cột/FK trong tài liệu nguồn |
| `tests/database.test.ts` | Kiểm tra dữ liệu và cấu hình không cần DB |

Theo yêu cầu chuẩn bị Prisma, bộ này dùng **Prisma làm nguồn migration**. Không tạo bộ EF Core migration song song. Khi dựng backend .NET, ánh xạ entity vào DB này; nếu nhóm chuyển sang EF Core quản lý schema, phải baseline lịch sử và chốt chuyển đổi trước.

## Dữ liệu demo

Seed có 6 phòng ban, 9 tài khoản thuộc 8 vai trò, khách hàng Active/Suspended, cây khu vực 3 cấp, dịch vụ, hợp đồng/phụ lục, bảng giá, sản lượng, thanh toán, lượt duyệt và phiên ký giả lập. Username dạng `demo.*`, email `example.invalid`; không có dữ liệu cá nhân thật.

Tài khoản seed mới dùng bcrypt cost 12 từ biến môi trường, bật bắt buộc đổi mật khẩu. Chín tài khoản hiện có trên QTKD_DATH được bỏ bắt đổi lần đầu theo thao tác reset riêng ngày 02/11/2026, không thay đổi fixture tạo mới. Backend .NET đã có custom hasher và test bcrypt hai chiều; lần chạy gần nhất bị abort do testhost không kết nối, chưa PASS. Đây không phải định dạng mặc định của ASP.NET Identity PasswordHasher. Không ghi mật khẩu thật vào source. Phiên đăng nhập mẫu đã thu hồi; OTP mẫu đã dùng và hết hạn.

Đường dẫn `demo-placeholder/...` chỉ là metadata, không có file thật. Seed không upload Storage, gửi email hoặc gọi dịch vụ ký. Các trạng thái lịch sử Approved/Issued/Succeeded được nhập sẵn làm fixture, không phải kết quả đã chạy luồng nghiệp vụ.

ID cố định, `skipDuplicates`, khóa transaction và kiểm tra ID được dùng để thiết kế seed chạy lại mà không xóa dữ liệu hoặc đổi mật khẩu đã có. Natural key trùng với ID khác làm transaction thất bại. **Tính chất chạy lại vẫn cần được kiểm thử trên Supabase thật.**

Các lựa chọn kiểu dữ liệu, xử lý comment và khoảng trống so với spec nằm trong [data-dictionary/DECISIONS.md](data-dictionary/DECISIONS.md). Chưa coi các task/API Sprint 1/2/3 hoàn tất chỉ từ bộ schema này.
