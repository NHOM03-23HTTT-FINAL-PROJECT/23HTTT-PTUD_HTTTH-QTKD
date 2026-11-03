# Chạy FE + Identity BE + Supabase trên máy local

Phạm vi TASK-022/023, phối hợp phần auth của TASK-025. Hướng dẫn bắt đầu nhanh ở [README gốc](../../README.md). API/dependency đã build theo bàn giao; FE typecheck/build và 15 tests đã PASS. Integration BE/PostgreSQL chưa có suite PASS đầy đủ, không coi source là đã nghiệm thu. Trong API mode, các màn nghiệp vụ chưa có API hiển thị chưa sẵn sàng; mock mode dùng để xem prototype.

## 1. Công cụ và thư mục

Dùng PowerShell tại gốc repo:

```powershell
# Mở terminal tại thư mục gốc repo trên máy của bạn.
node --version
npm --version
dotnet --list-sdks
```

Ưu tiên Node 24 LTS (FE đã kiểm tra trên 24.22.1); .NET SDK 10.0.403 hoặc bản vá phù hợp global.json trong backend/. Chạy .NET từ backend/ để áp dụng đúng global.json. Mở terminal mới sau khi cài Node/SDK. Nếu npm chưa có trong PATH nhưng đã cài Node Windows, có thể dùng `& 'C:/Program Files/nodejs/npm.cmd' --version`.

## 2. Nhận cấu hình local qua kênh riêng của nhóm

| File | Điền gì | Ai sử dụng |
| --- | --- | --- |
| DB/.env | DIRECT_URL lấy từ Supabase; SEED_PASSWORD là mật khẩu tài khoản app demo | Prisma migrate/seed |
| DB/.env.supabase-ca.crt | CA PostgreSQL đúng project nếu cần file CA riêng | Driver pg; BE qua PGSSLROOTCERT |
| backend/.env | Jwt__SigningKey riêng; ConnectionStrings__Identity tùy chọn | Start-Api.ps1 nạp vào tiến trình .NET |
| frontend/.env.local | VITE_AUTH_MODE=api, VITE_SESSION_IDLE_MINUTES=30 | Vite |

Nhóm tự chia sẻ các file .env qua nền tảng bảo mật. Sau khi nhận, đặt đúng thư mục; không copy .env.example đè lên file đã nhận. File CA có thể nhận cùng cấu hình hoặc tải từ SSL Configuration của đúng project. Đường dẫn CA là cấu hình theo máy, cần sửa lại dù các giá trị khác dùng chung. Không dùng mật khẩu database Supabase thay SEED_PASSWORD; đây là hai loại tài khoản khác nhau. Không đặt JWT key, database URI hoặc service key vào biến VITE_. Các file local trong bảng được Git ignore.

Giữ ConnectionStrings__Identity trống để launcher tự chuyển PostgreSQL URI trong DB/.env thành định dạng Npgsql. Có thể dùng override Npgsql key=value nếu nhóm cần cấu hình riêng. Thứ tự chọn connection của launcher: biến tiến trình ConnectionStrings__Identity → backend/.env cùng tên → biến tiến trình DIRECT_URL → DB/.env DIRECT_URL. JWT lấy biến tiến trình Jwt__SigningKey trước backend/.env. ValidateOnly cho biết nguồn connection đã chọn, không in secret. Launcher chỉ nạp hai biến JWT/connection, không export toàn bộ backend/.env; QTKD_TEST_* trong file không tự cấu hình test runner.

Nếu không nhận file có sẵn và cần dựng môi trường riêng, copy ba file .env.example sang tên local tương ứng, rồi tự điền thông tin project; Jwt__SigningKey cần ngẫu nhiên tối thiểu 32 byte UTF-8. Không dùng placeholder để chạy thật.

## 3. Lấy URI Supabase

Nếu nhận cấu hình DB chung đã được nhóm chuẩn bị, giữ nguyên project đó và dùng connection:check/migrate:status để đọc trạng thái. Không cần tự tạo project, migrate hoặc seed khi pull code. Các bước lấy URI dưới đây dành cho người dựng DB mới/đổi môi trường. Trạng thái DB đích cần kiểm tra thực tế, không suy từ việc có migration trong Git.

Trong dashboard Supabase, mở project → **Connect**:

Nếu chưa có project dev/test: Dashboard → New project → chọn organization, đặt tên (ví dụ QTKD-dev), đặt database password riêng, chọn region phù hợp rồi Create project. Chờ database sẵn sàng. Tên project không phải tên database trong URI: database mặc định vẫn là postgres, schema ứng dụng là qtkd do migration tạo.

- Chọn Direct connection, port **5432**, nếu mạng có IPv6.
- Nếu máy/mạng chỉ dùng IPv4, chọn **Session pooler**, port **5432** và giữ nguyên username có project ref do Connect cung cấp.
- Không chọn Transaction pooler port 6543 cho quy trình migration này.

Thay phần mật khẩu mẫu trong URI bằng **database password của project**. Nếu có ký tự đặc biệt, percent-encode phần password. Dùng query `schema=qtkd&sslmode=verify-full` (dùng `&` nếu URI đã có `?`). Ví dụ cấu trúc, không phải giá trị để copy nguyên:

```dotenv
DIRECT_URL="postgresql://<username>:<encoded-database-password>@<host-from-Connect>:5432/postgres?schema=qtkd&sslmode=verify-full&sslrootcert=./.env.supabase-ca.crt"
```

Chỉ cần PostgreSQL URI, không cần Supabase anon/service key cho kiến trúc Identity hiện tại. Không bật Supabase Auth hoặc mở RLS cho frontend để xử lý việc kết nối .NET.

Ví dụ dùng CA tại DB/.env.supabase-ca.crt và chạy lệnh DB từ DB/. Khi máy/driver đã tin CA có thể không cần sslrootcert riêng. File CA này khác HTTPS dev certificate của localhost. Đối với BE, launcher hiện chưa chuyển sslrootcert sang Npgsql, nên đặt PGSSLROOTCERT bằng đường dẫn tuyệt đối ở terminal BE như mục 6. Không cần sửa launcher để làm theo hướng dẫn này.

## 4. Cài dependency và kiểm tra offline

```powershell
Push-Location DB
npm ci
npm run check
Pop-Location

Push-Location frontend
npm ci
npm run typecheck
npm run build
npm run test:auth
Pop-Location

Push-Location backend
dotnet restore QTKD.slnx
dotnet build QTKD.slnx --no-restore
Pop-Location
```

Thực hiện từng khối, chỉ tiếp tục sau khi lệnh trước thành công. DB/check không kết nối PostgreSQL; FE tests dùng HTTP giả lập/SSR. Kiểm tra launcher không dùng mạng: `./backend/tests/LocalEnvironment.Tests.ps1` từ gốc repo.

Chạy integration BE trong terminal riêng từ backend/ bằng `dotnet test QTKD.slnx --no-build --logger 'trx;LogFileName=identity.trx'`. Mặc định SQLite in-memory và middleware thật; cần DB/node_modules/bcryptjs và Node trong PATH cho bcrypt interop. Không đặt QTKD_TEST_DATABASE_CONNECTION trừ khi đã chọn project test riêng. Xem [gate và giới hạn test](../testing/test-cases/identity.md). Integration không phải điều kiện để API có thể khởi động, nhưng là gate trước nghiệm thu task.

Nếu restore lỗi, kiểm tra DNS/proxy/mạng tới api.nuget.org, registry.npmjs.org và máy chủ engine Prisma. Không dùng --ignore-failed-sources để coi một restore thiếu package là thành công.

## 5. Chuẩn bị DB mới hoặc cập nhật schema

Người chỉ pull code để dùng DB chung chạy hai lệnh đọc từ DB/: `npm run connection:check`, `npm run migrate:status`. Nếu đã up-to-date thì bỏ qua phần ghi dữ liệu bên dưới. Migration pending cần phối hợp người phụ trách DB, không tự coi mỗi lần pull là một lần migrate/seed.

Các lệnh sau ghi vào Supabase được DIRECT_URL trỏ tới:

```powershell
Push-Location DB
npm run migrate:status
npm run migrate:deploy
npm run seed
npm run migrate:status
Pop-Location
```

Chỉ chạy phần ghi sau khi người phụ trách đã chọn đúng DB mới/dev/test hoặc lên lịch cập nhật DB chung. Project mới chạy cả ba migration; Prisma chỉ apply migration còn pending trên project hiện có. Không chạy migrate dev/reset, db push hoặc xóa lịch sử Prisma. Nếu báo migration cũ bị sửa/checksum khác hoặc natural-key collision khi seed, dừng và đối chiếu, không xóa dữ liệu để ép chạy.

Trên project dev/test riêng, chạy seed thêm một lần để kiểm tra tính chạy lại. Seed giữ nguyên tài khoản/mật khẩu đã có, không cập nhật mật khẩu chỉ vì thay SEED_PASSWORD.

Ngày 02/11/2026, theo phê duyệt riêng của người dùng, 9 tài khoản demo trên QTKD_DATH đã được reset về SEED_PASSWORD local tại thời điểm cập nhật, mở khóa, thu hồi phiên cũ và đặt must_change_password=false. Có thể đăng nhập bằng mật khẩu đó mà không phải đổi lần đầu. Chạy seed lại hoặc thay SEED_PASSWORD sau này vẫn không tự đổi mật khẩu tài khoản đã tồn tại; mọi lần reset DB dùng chung cần được giao riêng.

Mở SQL Editor và chạy các truy vấn đọc:

```sql
select migration_name, finished_at, rolled_back_at
from qtkd._prisma_migrations order by started_at;

select count(*) as app_tables
from information_schema.tables
where table_schema = 'qtkd' and table_type = 'BASE TABLE'
  and table_name <> '_prisma_migrations';

select count(*) as departments from qtkd.department;
select count(*) as roles from qtkd.role_definition;
select username, role, status, must_change_password
from qtkd.user_account where username like 'demo.%' order by username;
```

Sau khi migration và seed thành công trên project mới: 29 bảng app, 6 phòng ban, 10 role, 11 tài khoản demo. Database đã có dữ liệu khác có thể nhiều hơn. Trong Table Editor chọn schema qtkd. Không công khai schema/quyền cho anon để xem từ FE; backend dùng kết nối PostgreSQL server.

## 6. Chạy hai terminal

Tin cậy HTTPS development certificate một lần trên máy bạn:

```powershell
dotnet dev-certs https --trust
```

Terminal BE tại gốc repo:

```powershell
./backend/Start-Api.ps1 -ValidateOnly
# Khi dùng file CA riêng, đặt biến này trong chính terminal chạy BE.
$env:PGSSLROOTCERT = (Resolve-Path -LiteralPath './DB/.env.supabase-ca.crt').Path
./backend/Start-Api.ps1
```

ValidateOnly kiểm tra file và chuyển định dạng URI, không mở kết nối database hay kiểm tra file CA. Khi máy đã tin CA và không dùng file riêng, bỏ dòng PGSSLROOTCERT. Launcher chỉ nạp key/connection vào tiến trình chạy và phục hồi hai biến đó sau khi API dừng. PGSSLROOTCERT do bạn đặt vẫn tồn tại trong terminal. URL BE: https://localhost:7156. `/health/live` chỉ kiểm tra tiến trình, không xác nhận DB truy cập được.

Các biến QTKD_TEST_* là cấu hình runner test, không được Start-Api.ps1 xuất tự động. Khi có project test riêng, đặt chúng trực tiếp trong terminal chạy dotnet test theo docs/testing/test-cases/identity.md.

Terminal FE tại gốc repo:

```powershell
Push-Location frontend
npm run dev
```

Mở **http://localhost:5173** (không thay bằng IP LAN hoặc hostname khác). Vite proxy /api tới BE HTTPS. Nếu Vite tự đổi sang cổng 5174 vì cổng cũ đang bận, dừng instance cũ để giữ đúng Origin. Nếu trình duyệt chặn cookie Secure trên localhost, cấu hình FE HTTPS local; không bỏ Secure/SameSite để né lỗi.

Đăng nhập `demo.admin` bằng SEED_PASSWORD trong DB/.env đã dùng khi reset QTKD_DATH ngày 02/11/2026; 9 tài khoản demo này không bắt đổi mật khẩu lần đầu. Tài khoản tạo từ seed trên DB mới vẫn theo fixture hiện tại (mustChangePassword=true). Khi dùng luồng đổi mật khẩu, password mới phải đủ 12 ký tự, hoa/thường/số/ký tự đặc biệt, tối đa 72 byte UTF-8. Seed không tự đặt lại mật khẩu đã tồn tại.

## 7. Nghiệm thu và lỗi hay gặp

- Login/đổi mật khẩu/logout cần hoạt động; tải lại trang khôi phục bằng refresh cookie. 403 thiếu permission giữ phiên, 401 token/phiên mất hiệu lực mới xử lý kết thúc/khôi phục phiên.
- Không dùng tài khoản `an.nv` hoặc mật khẩu prototype cho API. Muốn xem prototype toàn bộ màn nghiệp vụ, đặt VITE_AUTH_MODE=mock rồi khởi động lại Vite.
- Trong API mode, các màn Khách hàng/Khu vực/Hợp đồng/Phê duyệt/Workflow chưa có API hiện thông báo chưa sẵn sàng và giữ phiên. Dashboard vẫn là dữ liệu minh họa; chưa có UI quản trị Identity đầy đủ. Đây không phải lỗi vô hiệu hóa tài khoản.
- VITE_SESSION_IDLE_MINUTES phục vụ timeout prototype/fallback hiển thị; thời hạn thật trong API mode lấy từ BE, không đổi chỉ bằng sửa FE env.
- 500 khi login sau khi migrate chưa đủ: đối chiếu migration 0003, role_definition và department.code; không tạo nhánh tài khoản không role.
- Liveness 200 nhưng login 500: xem log BE và DB connectivity; liveness không kiểm tra database.
- API SESSION_ENDED/CSRF_REJECTED: xem cookie và Origin/X-QTKD-CSRF trong DevTools, dùng đúng localhost:5173 và Vite proxy; không gọi FE trực tiếp bằng IP.
- Script bị Execution Policy chặn: xem chính sách của máy và dùng terminal PowerShell được cho phép. Không đổi policy toàn máy chỉ để chạy project.
- ERR_MODULE_NOT_FOUND trỏ generated/prisma/client.js: cập nhật bản sửa import `.ts`, chạy `npm run generate` trong DB rồi `npm run seed:check`. `npm run seed` đã có preseed để tự generate. DEP0205 trên Node 26 là cảnh báo độc lập; toàn bộ `npm run check` đã PASS trên Node 26.13.0. Có thể dùng Node 24 LTS theo cấu hình môi trường đề xuất.

Sau full build và PostgreSQL replay/seed đạt, cập nhật kết quả thực tế vào docs/testing/test-cases/identity.md rồi mới nghiệm thu các phase. Các hướng dẫn này không chứng minh các bước đã chạy thành công.

Nguồn chính thức đã đối chiếu: https://supabase.com/docs/guides/database/connecting-to-postgres và https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie (02/11/2026).
