# Database QTKD trên Supabase

Bộ Prisma độc lập này dựng toàn bộ **26 bảng, 239 cột còn hiệu lực, 59 khóa ngoại** trong `data-dictionary.md` được cung cấp ngày 02/11/2026, đối chiếu `spec nghiệp vụ + hệ thống (8).docx`. DB đích là PostgreSQL trên Supabase; không dùng PostgreSQL/Docker local. Backend ứng dụng vẫn là C#/.NET Web API.

**Chưa có Supabase để thực thi migration và seed.** Kiểm tra offline không chứng minh trigger, RLS, transaction hay việc chạy lại seed đã hoạt động trên PostgreSQL thật.

## Kiểm tra khi chưa có DB

Cần Node.js 22.18+ thuộc nhánh 22, hoặc 24.11+. Prisma được khóa ở bản ổn định 7.10.1. Chạy trong thư mục `DB/`:

```powershell
npm ci
npm run check
```

`check` validate schema, sinh Prisma Client, kiểm tra TypeScript, chạy test fixture, dry-run seed và đối chiếu migration với schema. Không mở kết nối DB. Lần đầu cài dependency/generate có thể cần mạng để tải package/engine.

`npm run seed:check` chỉ kiểm tra dữ liệu seed. URL `.invalid` trong `prisma.config.ts` chỉ giúp các lệnh offline đọc cấu hình; không phải DB local hoặc DB có thể kết nối.

## Chạy khi đã có project Supabase

1. Trong **Supabase > Connect**, lấy URI **Direct connection** cổng 5432. Nếu mạng không hỗ trợ IPv6, dùng **Session pooler** cổng 5432. Không dùng Transaction pooler cổng 6543 cho migration.
2. Copy `.env.example` thành `DB/.env`. Điền `DIRECT_URL` thật, giữ `schema=qtkd` và `sslmode=require`; URL-encode ký tự đặc biệt trong mật khẩu. Đặt `SEED_PASSWORD` riêng cho demo, tối thiểu 12 ký tự, tối đa 72 byte UTF-8.
3. Chạy từ `DB/`:

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
| `prisma/schema.prisma` | Nguồn cấu trúc 26 model và 20 enum |
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

Mật khẩu băm bcrypt cost 12 từ biến môi trường, bật bắt buộc đổi mật khẩu. Backend .NET cần xác minh bcrypt tương ứng; đây không phải định dạng mặc định của ASP.NET Identity PasswordHasher. Không ghi mật khẩu cố định vào source. Phiên đăng nhập mẫu đã thu hồi; OTP mẫu đã dùng và hết hạn.

Đường dẫn `demo-placeholder/...` chỉ là metadata, không có file thật. Seed không upload Storage, gửi email hoặc gọi dịch vụ ký. Các trạng thái lịch sử Approved/Issued/Succeeded được nhập sẵn làm fixture, không phải kết quả đã chạy luồng nghiệp vụ.

ID cố định, `skipDuplicates`, khóa transaction và kiểm tra ID được dùng để thiết kế seed chạy lại mà không xóa dữ liệu hoặc đổi mật khẩu đã có. Natural key trùng với ID khác làm transaction thất bại. **Tính chất chạy lại vẫn cần được kiểm thử trên Supabase thật.**

Các lựa chọn kiểu dữ liệu, xử lý comment và khoảng trống so với spec nằm trong [data-dictionary/DECISIONS.md](data-dictionary/DECISIONS.md). Chưa coi các task/API Sprint 1/2/3 hoàn tất chỉ từ bộ schema này.
