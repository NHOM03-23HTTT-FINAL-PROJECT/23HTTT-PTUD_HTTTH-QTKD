# QTKD — Quản trị kinh doanh logistics

Ứng dụng quản lý nghiệp vụ logistics theo kế hoạch Sprint 1. Nhánh TASK-022/023 bổ sung Identity: đăng nhập/đăng xuất, phiên, tài khoản, phòng ban, vai trò và quyền. Các module nghiệp vụ khác hiện chủ yếu là FE prototype; chưa nghiệm thu toàn bộ Sprint 1.

## Công nghệ và vị trí source

| Phần | Công nghệ / thư mục |
| --- | --- |
| Frontend | React 18.3.1, TypeScript 5.6.3, Vite 5.4.11 — [frontend/](frontend/README.md) |
| Backend | .NET 10, ASP.NET Core Identity Core, JWT, EF Core/Npgsql; bốn tầng Api/Application/Domain/Infrastructure — [backend/](backend/README.md) |
| Database | PostgreSQL trên Supabase; Prisma 7.10.1 là nguồn migration duy nhất — [DB/](DB/README.md) |
| Tài liệu | [Kiến trúc](docs/architecture/STRUCTURE.md), [ADR](docs/decisions/README.md), [API Identity](docs/specs/identity/list_api-auth.md) |

BE thực tế ở `backend/`. Supabase chỉ cung cấp PostgreSQL trong luồng Identity này; không dùng Supabase Auth. FE gọi BE qua `/api`, không kết nối PostgreSQL trực tiếp.

## Sau khi pull code

### 1. Chuẩn bị công cụ và cấu hình riêng

- Node.js 24 LTS (đã kiểm tra FE trên 24.22.1) và npm.
- .NET SDK 10.0.403; [backend/global.json](backend/global.json) cho phép bản vá mới cùng feature band. Chạy lệnh .NET từ `backend/` để dùng đúng SDK đã pin.
- PowerShell cho launcher local; truy cập được PostgreSQL Supabase và nguồn package npm/NuGet.

Nhận các file cấu hình từ thành viên phụ trách qua nền tảng bảo mật của nhóm, rồi đặt đúng vị trí:

| File local | Nội dung | Cần chỉnh trên từng máy |
| --- | --- | --- |
| `DB/.env` | `DIRECT_URL`, `SEED_PASSWORD` | Đường dẫn CA trong `sslrootcert`; kiểm tra đúng project DB |
| `DB/.env.supabase-ca.crt` | CA PostgreSQL tương ứng project, nếu driver cần CA riêng | Đặt file đúng tên; có thể tải từ SSL Configuration của project |
| `backend/.env` | `Jwt__SigningKey`; `ConnectionStrings__Identity` tùy chọn | Thường để connection override trống để dùng `DB/.env` |
| `frontend/.env.local` | `VITE_AUTH_MODE=api`, `VITE_SESSION_IDLE_MINUTES=30` | Chọn `api` hoặc `mock`, khởi động lại Vite sau khi đổi |

Git chỉ chứa các file `.env.example`. Không cần gửi giá trị `.env` qua issue, README hoặc commit. `SEED_PASSWORD` là mật khẩu tài khoản ứng dụng demo khi tạo mới; khác database password nằm trong `DIRECT_URL`. Không đưa DB URI/JWT key vào biến `VITE_*` vì các biến này được đưa vào FE.

Nếu dùng CA đặt tại `DB/.env.supabase-ca.crt`, phần query của `DIRECT_URL` có thể là:

```text
?schema=qtkd&sslmode=verify-full&sslrootcert=./.env.supabase-ca.crt
```

Chạy lệnh DB từ `DB/` để đường dẫn `./` trỏ đúng. Không dùng đường dẫn Windows chứa backslash trong URI có ngoặc kép; dùng `/` và percent-encode khi cần. Chi tiết: [TLS/CA](docs/setup/DATABASE-TLS.md).

### 2. Cài dependency

Từ gốc repo, chạy từng khối và xử lý lỗi trước khi tiếp tục:

```powershell
Push-Location DB
npm ci
npm run generate
Pop-Location

Push-Location frontend
npm ci
Pop-Location

Push-Location backend
dotnet restore QTKD.slnx
dotnet build src/QTKD.Api/QTKD.Api.csproj --no-restore
Pop-Location
```

### 3. Kiểm tra DB đích

Nếu dùng DB chung đã được phụ trách DB chuẩn bị, thành viên mới chỉ kiểm tra kết nối và lịch sử migration; không cần tự seed lại:

```powershell
Push-Location DB
npm run connection:check
npm run migrate:status
Pop-Location
```

`connection:check` chỉ chạy `SELECT 1`. Nếu migration pending hoặc DB chưa có dữ liệu, phối hợp người phụ trách; quy trình dành cho DB mới/dev/test ở [LOCAL-FULLSTACK.md](docs/setup/LOCAL-FULLSTACK.md#5-chuẩn-bị-db-mới-hoặc-cập-nhật-schema). Không chạy `migrate reset`, `db push` hoặc EF migration trên DB ứng dụng. Seed không đổi mật khẩu tài khoản đã tồn tại và không phục hồi grants đã bị admin gỡ.

### 4. Chạy backend và frontend

Tin cậy HTTPS dev certificate một lần trên máy:

```powershell
dotnet dev-certs https --trust
```

Terminal **BE**, từ gốc repo:

```powershell
# Khi dùng CA riêng: Npgsql hiện chưa nhận sslrootcert từ launcher.
$env:PGSSLROOTCERT = (Resolve-Path -LiteralPath './DB/.env.supabase-ca.crt').Path
./backend/Start-Api.ps1 -ValidateOnly
./backend/Start-Api.ps1
```

Nếu hệ thống đã tin CA và không dùng file CA riêng, bỏ dòng gán `PGSSLROOTCERT`. `ValidateOnly` kiểm tra cấu hình, không mở kết nối DB. `dotnet run` trực tiếp không tự đọc `backend/.env`. `/health/live` tại BE chỉ kiểm tra tiến trình.

Terminal **FE**, từ gốc repo:

```powershell
Set-Location frontend
npm run dev
```

Mở **http://localhost:5173**; BE chạy **https://localhost:7156**. Vite proxy `/api` sang BE. Giữ đúng cổng 5173 và hostname `localhost` để khớp Origin/cookie. Nếu Vite tự nhảy cổng vì instance cũ đang chạy, dừng instance đó rồi chạy lại.

## Đăng nhập và giới hạn hiện tại

API mode dùng mật khẩu demo được nhóm chia sẻ riêng, không dùng mật khẩu prototype:

| Username | Vai trò DB |
| --- | --- |
| `demo.sales` | SalesStaff |
| `demo.sales.manager` | SalesManager |
| `demo.operations` | OperationsStaff |
| `demo.operations.manager` | OperationsManager |
| `demo.accountant`, `demo.accountant.reviewer` | Accountant |
| `demo.legal` | LegalStaff |
| `demo.legal.manager` | LegalManager (Trưởng phòng Pháp chế, trưởng PC, có tab Phân công người duyệt) |
| `demo.board` | BoardMember |
| `demo.board.chair` | BoardChair (Tổng Giám đốc, trưởng BGĐ, có tab Phân công người duyệt) |
| `demo.admin` | SystemAdmin |

Role Accountant hiện có grants rỗng nhưng vẫn đăng nhập được. Tên `.reviewer` không tạo role/quyền riêng. Trên QTKD_DATH, chín tài khoản hiện có đã được reset và bỏ bắt đổi mật khẩu theo phê duyệt riêng ngày 02/11/2026; tài khoản seed trên DB mới vẫn có `mustChangePassword=true`. Đổi `SEED_PASSWORD` trong file không tự đổi mật khẩu đã lưu trong DB.

- `api`: auth/phiên/đổi mật khẩu gọi BE. Các màn Khách hàng/Khu vực/Hợp đồng/Phê duyệt/Workflow chưa có API hiển thị **Chức năng chưa sẵn sàng** và giữ phiên. UI quản trị users/roles chưa hoàn chỉnh dù đã có endpoint BE. Dashboard vẫn có dữ liệu minh họa, không phải số liệu DB thật.
- `mock`: chạy FE prototype bằng tài khoản trong [hướng dẫn FE](frontend/README.md), không cần BE/DB. Đặt `VITE_AUTH_MODE=mock` rồi khởi động lại Vite. UUID/tài khoản thật không dùng được với auth mock.
- Trong API mode, BE quyết định thời hạn phiên; đổi `VITE_SESSION_IDLE_MINUTES` không đổi timeout server. Thiếu permission trả 403 và giữ phiên.

## Kiểm tra và xử lý lỗi

Lệnh kiểm tra offline, integration và các giới hạn bằng chứng nằm tại [Identity test cases](docs/testing/test-cases/identity.md). FE typecheck/build và 15 tests đã PASS; DB offline check 22 tests đã PASS theo nhật ký. Integration BE/PostgreSQL chưa có suite PASS đầy đủ; TASK-022/023 chưa hoàn tất.

| Hiện tượng | Kiểm tra |
| --- | --- |
| Vite báo `ECONNREFUSED /api/...` | BE đã chạy và lắng nghe 7156; kiểm tra HTTPS dev certificate |
| `ENOENT` khi đọc CA | File CA tồn tại, tên/path đúng; DB chạy từ `DB/`, BE dùng path tuyệt đối |
| TLS/P1011 | Chạy `connection:check`; xem [TLS/CA và mã lỗi](docs/setup/DATABASE-TLS.md) |
| `ENOTFOUND` / `ENETUNREACH` | DNS/kết nối IPv6; dùng đúng Session pooler cổng 5432 từ Connect khi cần |
| Đăng nhập sai mật khẩu demo | Đối chiếu mật khẩu hiện hành qua kênh riêng; seed không reset mật khẩu cũ |
| Cấu hình vừa sửa không có hiệu lực | Khởi động lại tiến trình; kiểm tra biến môi trường đang override file `.env` |
| Mở Hợp đồng báo chưa sẵn sàng | Hành vi dự kiến của API mode; dùng mock mode để xem prototype |

## Tài liệu để tiếp tục phát triển

- [Hướng dẫn local đầy đủ](docs/setup/LOCAL-FULLSTACK.md): precedence cấu hình, DB mới và kiểm tra sau setup.
- [Changelog kiến trúc/kỹ thuật](docs/specs/identity/CHANGELOG.md): quyết định, tác động tới các module sau và lịch sử thay đổi.
- [Kế hoạch TASK-022/023](docs/specs/identity/TASK-022-023-PLAN.md) và [ADR](docs/decisions/README.md).
- [Phạm vi Sprint 1](context/SPRINT-1.md), [quy tắc nghiệp vụ](context/BUSINESS-RULES.md), [tài liệu nguồn](docs/sources/).

Agent đọc [AGENTS.md](AGENTS.md) và [skill qtkd-sprint1](.agents/skills/qtkd-sprint1/SKILL.md) trước khi thay đổi. Thư mục giữ chỗ hoặc source có sẵn không chứng minh task đã hoàn tất; xác định đúng TASK/US và kiểm chứng phần được giao.


Contracts CRUD and cancellation integration: [setup](backend/GETTING-STARTED.md).
