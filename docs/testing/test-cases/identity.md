# TASK-022/023 — kiểm thử Identity

## Kiểm tra tài liệu onboarding và launcher - 02/11/2026

Lượt chuẩn hóa README/đề xuất commit chỉ sửa tài liệu, không thay runtime hoặc DB.

| Kiểm tra thực chạy | Kết quả |
| --- | --- |
| `./backend/tests/LocalEnvironment.Tests.ps1` từ gốc repo | PASS: parse literal .env, quote/decode URI, Session pooler, validation và precedence; fixture tổng hợp, không dùng mạng |
| Kiểm tra đường dẫn link Markdown trong tài liệu onboarding | PASS tại lượt cập nhật README; các liên kết tới bản chia commit nội bộ đã được gỡ trước bàn giao repo |
| `git diff --check` | PASS trên phần diff tracked |
| `git check-ignore DB/.env DB/.env.supabase-ca.crt backend/.env frontend/.env.local` | Cả 4 đường dẫn được ignore |
| Đối chiếu phạm vi với git status gồm file untracked | Thay đổi TASK-022/023 được phân nhóm; .gitignore/.codegraph ghi riêng, bản chia commit nội bộ không đưa vào repo |

Đã đối chiếu lệnh chạy và tên biến với package.json, global.json, launchSettings.json, Start-Api.ps1 và LocalEnvironment.psm1. Không chạy migrate/seed, không sửa/chia sẻ file .env thực. Chưa chạy clean-clone/fullstack trên máy thành viên mới; FE/DB/build/integration giữ đúng kết quả và giới hạn của các lượt trước bên dưới.

## Hồi quy auth API / nghiệp vụ mock - 02/11/2026

Kết quả chạy mới trên Node 24.22.1:

| Kiểm tra | Kết quả |
| --- | --- |
| `node node_modules/typescript/bin/tsc -b --noEmit` trong frontend | PASS |
| `node node_modules/vite/bin/vite.js build` trong frontend | PASS; cảnh báo bundle trên 500 kB |
| `node --experimental-transform-types --test --test-reporter=spec tests/*.test.mjs` trong frontend | PASS, 15/15 (10 HTTP/session + 5 hồi quy) |

`frontend/tests/business-routes.test.mjs` nạp route/component/adapter thật bằng TypeScript và Node module hooks; thay context đăng nhập, Vite env/SVG URL và HTTP bằng fixture cục bộ. Không gọi DB hoặc mạng thật.

- 26 route Khách hàng/Khu vực/Hợp đồng/Phê duyệt/Workflow, gồm tạo/sửa/chi tiết: UUID thật với permission phù hợp chỉ nhận thông báo chưa sẵn sàng, không mount màn mock và không xóa auth state.
- Thiếu permission: chặn trước thông báo chưa sẵn sàng, giữ auth state. SSR không thực thi hiệu ứng Navigate; kiểm tra điều hướng thực tế về dashboard vẫn thuộc QA trình duyệt.
- Mock mode: cho mount nội dung khi có quyền, chặn khi thiếu quyền. Hàm mockListContracts thật vẫn chấp nhận tài khoản prototype và từ chối UUID ngoài seed; không nới kiểm tra mock.
- Auth adapter API dùng `/auth/session` với UUID thật. HTTP giả lập trả active thì giữ phiên; disabled/expired và refresh thất bại thì xóa auth state, phát đúng sự kiện kết thúc phiên.
- Test HTTP hiện có tiếp tục xác nhận 403 giữ phiên, refresh/logout race ở client và chống khôi phục phiên sau logout.

Chưa QA trình duyệt fullstack sau sửa. Theo bàn giao, API/dependency đã build và người dùng đã đăng nhập thật; bcrypt interop gần nhất bị abort vì testhost không kết nối sau 90 giây. Chưa có suite integration BE PASS và chưa kiểm chứng race/replay/seed hai lần trên PostgreSQL test riêng. Các bảng phía dưới là lịch sử, không thay thế cập nhật này.

## Kiểm chứng reset demo được phê duyệt - 02/11/2026

Đã cập nhật đúng 9 tài khoản demo QTKD_DATH trong một transaction theo yêu cầu người dùng: mật khẩu lấy từ SEED_PASSWORD local, không bắt đổi lần đầu, mở khóa/xóa bộ đếm và thu hồi phiên cũ. Đối chiếu sau commit: matching_password_accounts=9, no_first_change_accounts=9, unlocked_active_accounts=9, unrevoked_sessions=0. Kiểm tra bcrypt cục bộ xác nhận giá trị SEED_PASSWORD mới nhất khớp hash đã ghi; không in mật khẩu hoặc hash. Chưa thử đăng nhập UI/API trong lượt này; kết quả không thay thế các gate integration test bên dưới.

## Cập nhật chẩn đoán TLS P1011 - 02/11/2026

npm run check PASS trên Node 26.13.0, gồm 22/22 tests (bổ sung 3 test chẩn đoán DNS/TLS/auth và che thông tin riêng tư), validate/generate/typecheck, dry-run và DDL tĩnh. npm run connection:check thử kết nối đọc bằng pg nhưng bị ENOTFOUND trước TLS. Chưa chứng minh kết nối TLS hoặc seed ghi dữ liệu thành công; không chạy migration/seed thật. Quy trình CA: ../../setup/DATABASE-TLS.md.

## Cập nhật kiểm chứng DB sau lỗi seed - 02/11/2026

Đã chạy npm run check trong DB trên Node 26.13.0, exit code 0: Prisma validate/generate, TypeScript noEmit, 19/19 tests, seed dry-run đủ 29 bảng và so sánh DDL tĩnh đều PASS. Dry-run riêng trên Node 24.22.1 cũng PASS. DEP0205 trên Node 26 là warning, không làm các kiểm tra thất bại.

Đã khắc phục import generated client sai đuôi .js, thống nhất output/import .ts với tsx và tự generate trước npm run seed. Các test bổ sung kiểm tra bộ so sánh migration với qtkd qualification, CRLF, ADD COLUMN/SET NOT NULL và khóa chính ghép.

Các kết quả này thay thế tình trạng thiếu dependency DB trong bảng lịch sử bên dưới. Chưa replay migration hoặc chạy seed ghi dữ liệu trên PostgreSQL; chưa xác minh seed lặp lại hay integration BE. Trạng thái FE và BE bên dưới chưa được kiểm tra lại trong lượt sửa seed này.

## Trạng thái tại lượt triển khai ban đầu ngày 02/11/2026 (lịch sử)

| Kiểm tra | Kết quả |
| --- | --- |
| Build QTKD.Domain và QTKD.Application | PASS, 0 warning / 0 error |
| FE HTTP/session tests bằng Node native TypeScript | PASS, 10/10; kiểm tra 403/refresh/logout và local logout intent |
| DB Identity source/matrix checks bằng Node native TypeScript | PASS, 4/4; đối chiếu FE/BE/seed/migration, không thực thi PostgreSQL |
| C# syntax và kiểm tra tĩnh phần service/store/map | Đã thực hiện; không thay thế full build hoặc runtime test |
| NuGet restore API / integration test | BLOCKED: shell không phân giải được api.nuget.org; thiếu JWT bearer, BCrypt và thư viện test trong cache |
| npm ci offline FE / DB | BLOCKED: cache thiếu package; chưa đủ dependency để typecheck/build/generate |
| Integration tests JWT/permission/logout | Đã viết, CHƯA CHẠY; không báo pass |
| Prisma migration replay / seed hai lần / enum / RLS / row lock | CHƯA CHẠY trên Supabase test riêng |
| DB chung | Chỉ đọc metadata; xác nhận có 26 bảng và _prisma_migrations. Không apply migration mới |

## Chạy lại khi có dependency

Từ gốc repo:

```powershell
node --experimental-transform-types --test frontend/tests/auth-client.test.mjs frontend/tests/session-store.test.mjs
node --experimental-transform-types --test DB/tests/identity-offline.test.mjs
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
dotnet restore backend/QTKD.slnx
dotnet test backend/QTKD.slnx --logger "trx;LogFileName=identity.trx"
```

Các package versions được khóa trong csproj/package-lock.json. Restore .NET thành công sẽ sinh packages.lock.json; không giữ lock file thiếu dependency do restore thất bại. Khi đã có lock hợp lệ, CI nên dùng restore --locked-mode.

Hai lệnh Node đầu dùng Node 24 và không yêu cầu npm install. Suite đầy đủ `npm run test:auth` cần dependency frontend (React/TypeScript) cho test route SSR. Các test này không thay thế QA trình duyệt hoặc integration test BE.

Suite mặc định dùng SQLite in-memory và middleware JWT/Identity/password thật, không thay authentication bằng TestAuthHandler. Cần Node và bcryptjs trong DB/node_modules cho kiểm tra hash hai chiều .NET/bcryptjs. SQLite là kiểm tra API offline bổ sung, không phải bằng chứng schema PostgreSQL.

## Gate PostgreSQL

Nhóm cần cấp **project Supabase riêng dành cho test**, apply các migration bằng `QTKD.DbTool migrate` và seed ở đó trước (trước 04/11/2026 là Prisma). Sau đó đặt riêng trong terminal kiểm thử:

```powershell
# Điền giá trị riêng tư trong terminal, không ghi vào Git hoặc báo cáo.
$env:QTKD_TEST_DATABASE_CONNECTION = '<Npgsql connection string của project test, TLS, port 5432>'
$env:QTKD_TEST_DATABASE_IS_DISPOSABLE = 'true'
dotnet test backend/QTKD.slnx --logger "trx;LogFileName=identity-postgres.trx"
```

Không lấy connection ứng dụng làm fallback. Test không chạy EF migration/EnsureCreated/EnsureDeleted trên PostgreSQL. Factory chỉ tạo và dọn tài khoản test với prefix GUID và phiên tương ứng; một số test thay rồi phục hồi grants/config. Chỉ chạy trên project bỏ được. Test concurrent refresh được đánh dấu Skip khi thiếu DB PostgreSQL; không tính SQLite pass là đã chứng minh khóa dòng.

## Kịch bản đã viết

- Login username/email, JWT chuẩn, cookie Secure/HttpOnly/SameSite, không trả refresh token trong JSON.
- Sai mật khẩu/không tồn tại không tạo phiên; username/email chia sẻ lockout 5 lần/15 phút.
- Role không có permission vẫn login; cùng endpoint /users trả 403 cho Accountant và 200 cho admin; session vẫn sống sau 403.
- Thiếu token, token hỏng/sai chữ ký/issuer/audience/algorithm/hết hạn ngoài clock skew trả 401, không redirect.
- Logout thu hồi JWT còn hạn và refresh; giữ phiên thiết bị khác; gọi lặp được.
- Refresh xoay cookie, từ chối cookie cũ; logout bằng cookie trước rotation vẫn thu hồi phiên. Concurrent refresh kiểm tra trên PostgreSQL.
- Cookie endpoint từ chối thiếu CSRF header hoặc Origin ngoài allowlist.
- Idle và absolute expiry do server kiểm tra; polling không kéo dài idle, activity có gia hạn.
- Mật khẩu tạm bị chặn nghiệp vụ; đổi mật khẩu thành công thu hồi phiên khác.
- Cấp tài khoản thiếu role trả 400; role config lỗi trả 500 SYSTEM_ERROR và không tạo phiên.
- User được EF track trước một thay đổi mật khẩu phải reload sau lock; không được login bằng snapshot password cũ.
- Cấp tài khoản hợp lệ, thay đổi grants có hiệu lực không cần JWT mới, chặn bỏ quyền admin thiết yếu.
- Vô hiệu hóa user thu hồi phiên; resource handler đòi đủ permission/scope/owner/assignee/state.
- Hash từ bcryptjs được .NET xác minh và ngược lại; password chỉ đi qua stdin, không in ra log.

## Review FE sau khi BE chạy

API mode: đăng nhập → đổi mật khẩu tạm → tải lại trang → thao tác thiếu quyền (403 vẫn giữ phiên) → cảnh báo idle → tiếp tục → logout → dùng JWT cũ bị 401. Thử mất mạng lúc logout: UI chỉ xác nhận đã xóa phiên cục bộ. Không có thông báo NO_ROLE.

API mode: mở các màn Khách hàng/Khu vực/Hợp đồng/Phê duyệt/Workflow (cả URL chi tiết/tạo/sửa) chỉ nhận thông báo chức năng chưa sẵn sàng, vẫn có thể về dashboard và đổi mật khẩu/đăng xuất. Thiếu quyền vẫn về dashboard kèm cảnh báo; kiểm tra phiên thật bị vô hiệu hóa/hết hạn vẫn đưa về login. Các màn nghiệp vụ sẽ được mở cho API mode khi module tương ứng có API và kiểm tra quyền ở BE.

Mock mode: kiểm tra các tài khoản prototype còn lại; hai tài khoản thiếu role đã bỏ. Màn nghiệp vụ vẫn dùng auth/permission mock, không ghép UUID API vào seed prototype; không suy ra đã triển khai API CUS/ARE/CTR/workflow từ bộ test này.
