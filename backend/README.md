# QTKD Identity backend — TASK-022/023

.NET 10, Api/Application/Domain/Infrastructure. Identity Core custom store trên schema qtkd hiện có, EF Core/Npgsql chỉ truy cập dữ liệu; Prisma quản lý migration.
Đọc docs/specs/identity/TASK-022-023-PLAN.md và ADR 0001–0003 trước khi sửa hợp đồng auth.

## Hiện trạng

Có source login/JWT/session/refresh/logout/change-password, quản lý users/departments/role grants, policy và integration tests.
Theo bàn giao, project API và dependency đã build; người dùng đã đăng nhập thật. Chưa có suite integration BE/PostgreSQL PASS đầy đủ; bcrypt interop gần nhất bị abort vì testhost không kết nối sau 90 giây. Không coi các task nghiệp vụ khác đã hoàn tất.
Tài liệu API: ../docs/specs/identity/list_api-auth.md. Bằng chứng kiểm tra: ../docs/testing/test-cases/identity.md.

## Chuẩn bị và chạy

1. Cài .NET SDK 10.0.403 (global.json cho phép bản vá mới trong feature band), Node/npm phù hợp DB/frontend.
2. Nhận backend/.env và DB/.env qua kênh bảo mật của nhóm. Từ backend/, chạy `dotnet restore QTKD.slnx`, rồi `dotnet build src/QTKD.Api/QTKD.Api.csproj --no-restore`; global.json áp dụng theo thư mục chạy lệnh.
3. Với DB chung đã chuẩn bị, chỉ kiểm tra connection/migrate:status từ DB/. Chỉ phụ trách DB mới cần deploy/seed theo DB/README.md; không dùng EF migration, EnsureCreated hoặc reset DB ứng dụng.
4. Khi dùng override: ConnectionStrings:Identity là Npgsql key=value connection string, `SSL Mode=VerifyFull`, PostgreSQL direct/session port 5432; Jwt:SigningKey ngẫu nhiên ít nhất 32 byte. Không dùng service key hoặc API URL thay connection string.
5. dotnet run --project backend/src/QTKD.Api --launch-profile https. API mặc định https://localhost:7156.

Để dùng file .env local đã chuẩn bị, xem [hướng dẫn fullstack](../docs/setup/LOCAL-FULLSTACK.md). Chạy từ gốc repo `./backend/Start-Api.ps1 -ValidateOnly`, rồi `./backend/Start-Api.ps1`. Launcher đọc backend/.env, giữ ConnectionStrings__Identity trống để tự chuyển URI từ DB/.env; không in secret. Plain dotnet run ở bước 5 chỉ phù hợp khi đã export biến môi trường hoặc dùng user secrets, không tự đọc backend/.env.

Launcher hiện chuyển sslmode nhưng chưa chuyển sslrootcert. Khi dùng CA tại DB/.env.supabase-ca.crt, chạy trong terminal BE từ gốc repo:

```powershell
$env:PGSSLROOTCERT = (Resolve-Path -LiteralPath './DB/.env.supabase-ca.crt').Path
./backend/Start-Api.ps1
```

CA PostgreSQL này khác HTTPS development certificate. Chạy `dotnet dev-certs https --trust` một lần để tin cậy HTTPS local. ValidateOnly không kiểm tra kết nối DB hoặc đọc CA.

Có thể đặt secret bằng environment Jwt__SigningKey và ConnectionStrings__Identity hoặc dotnet user-secrets của project. Không commit giá trị vào appsettings, README, log hoặc .env.example. Thiếu cấu hình, ứng dụng fail startup.
Các giá trị timeout/Cors:Origins ở appsettings.json là cấu hình không nhạy cảm. Cấu hình AllowedHosts và origins đúng khi đổi host.
Liveness /health/live chỉ chứng minh tiến trình chạy, không chứng minh kết nối DB.

FE dùng Vite proxy /api tới backend; bật VITE_AUTH_MODE=api. Cookie Secure đòi trình duyệt hỗ trợ ngữ cảnh localhost an toàn hoặc frontend HTTPS. Không tắt Secure để chạy production.

## Kiểm thử

Từ backend/: `dotnet test QTKD.slnx`. Mặc định SQLite in-memory với Identity/JWT middleware thật; không thay bằng auth handler luôn thành công. Test parser launcher độc lập từ gốc repo: `./backend/tests/LocalEnvironment.Tests.ps1`.
Chạy npm ci trong DB trước kiểm tra bcrypt hai chiều. Bộ test PostgreSQL dùng project test Supabase riêng và cần hai biến môi trường được mô tả trong tài liệu kiểm thử. Không tự dùng DB ứng dụng làm DB test.

## Ranh giới

- Application chỉ tham chiếu Domain; Api composition root đăng ký Infrastructure qua DI.
- UserManager xử lý user/password/email qua custom store. Vai trò/quyền qua IIdentityService; không dùng RoleManager mặc định.
- Runtime grants ở DB; FE permission constants phục vụ prototype/hiển thị.
- ResourceAccess handler không thay việc module sở hữu kiểm tra scope, trạng thái và assignee trong transaction.
- Logging vận hành có correlation/actor; audit interceptor append-only thuộc TASK-024, chưa triển khai ở đây.
- Chưa có các controller nghiệp vụ khác, UI quản trị hoàn chỉnh, OTP/email, deployment hoặc CI.
