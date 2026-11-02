# Identity — nhật ký thay đổi

## Bản tổng hợp kiến trúc và kỹ thuật cho team

Áp dụng TASK-022/023, PB-02, nhánh `Minh/task-022-023`. ADR 0001–0003 là quyết định đã chốt; bảng này mô tả code hiện có và cách module sau tích hợp. Trạng thái nghiệm thu nằm trong [plan](TASK-022-023-PLAN.md) và [test cases](../../testing/test-cases/identity.md). Các mục nhật ký phía dưới ghi theo thời điểm, có thể chứa giới hạn môi trường đã được khắc phục ở lượt sau.

| Thay đổi quan trọng | Hiện tại | Cộng sự cần theo dõi |
| --- | --- | --- |
| Vị trí và tầng BE | `backend/src/QTKD.Api`, Application, Domain, Infrastructure; .NET 10 | Không dựng thêm backend trong BE/. Application/Domain giữ độc lập với HTTP/EF; Api là composition root |
| Identity | Identity Core với custom UserAccountStore trên schema qtkd, UserManager cho user/password/email | Không tạo schema AspNetUsers/AspNetRoles song song; role/grants qua IIdentityService |
| Chủ sở hữu schema | Prisma là nguồn migration duy nhất, EF Core/Npgsql map và truy cập DB | Thêm DDL trong DB/prisma/migrations; không EF Migrate/EnsureCreated trên DB ứng dụng. EnsureCreated trong fixture SQLite chỉ dùng cho test offline |
| Schema Identity | Migration 202611020003_identity bổ sung 3 bảng role_definition/permission/role_permission, department.code, metadata mật khẩu/phiên; 29 model | Giữ nguyên hai migration cũ. Kiểm tra migrate:status trên từng DB; không suy ra đã deploy từ source |
| Role bắt buộc | Một tài khoản đúng một role; DTO roles giữ array một phần tử. Bỏ NO_ROLE và hai mock thiếu role | Role hợp lệ có thể không có permission. Lỗi role/config khi login là 500 SYSTEM_ERROR, không tạo phiên |
| Quyền hiện hành | Đọc grants từ DB mỗi request; FE API mode dùng permissions BE trả, không suy từ role | Thiếu quyền trả 403 và giữ phiên. Module sở hữu vẫn phải kiểm tra scope/owner/assignee/trạng thái ở BE |
| Mật khẩu | bcrypt cost 12, tương thích bcryptjs; mật khẩu mới 12 ký tự trở lên, tối đa 72 byte UTF-8, có hoa/thường/số/ký tự đặc biệt | Không dùng PasswordHasher mặc định để xác minh hash seed; lockout 5 lần sai/15 phút; interop chưa có test PASS |
| JWT và phiên DB | Access JWT HS256 10 phút, clock skew 60 giây, idle 30 phút, giới hạn tuyệt đối 8 giờ | JWT hợp lệ vẫn phải có session DB hợp lệ. Polling/session/refresh không gia hạn idle; activity có tương tác mới gia hạn |
| Refresh/logout | Cookie HttpOnly/Secure/SameSite Strict; refresh xoay secret, proof logout ổn định, DB lưu hash | Cookie cũ sau rotation vẫn chứng minh logout nhưng không refresh được. Chưa có token-family history để thu hồi toàn family khi reuse; race PostgreSQL còn cần kiểm chứng |
| Đồng thời và thu hồi | Lock user trong transaction; reload entity đã được EF track sau lock. Đổi password thu hồi phiên khác; đổi role/phòng ban/status thu hồi phiên user | Kiểm tra trên PostgreSQL riêng; SQLite không chứng minh row lock, enum hay RLS. Logout lỗi mạng chỉ bảo đảm xóa phiên cục bộ |
| HTTP client FE | Dùng fetch trong lib/http/client.ts; access token ở bộ nhớ, refresh trong cookie | Chưa dùng axios như định hướng ban đầu. Web Storage chỉ chứa metadata/cờ logout; phản hồi refresh cũ không được khôi phục phiên sau logout |
| Ranh giới prototype | BusinessRoute kiểm tra permission rồi chặn 26 route nghiệp vụ mock trong API mode | Khi có API nghiệp vụ, thay adapter và mở từng route tương ứng; không nối UUID thật vào mockCheckSession. Dashboard hiện vẫn là dữ liệu minh họa |
| Runtime grants/seed | Migration bootstrap grants; seed dùng ID cố định/skipDuplicates, không reset password hay phục hồi quyền admin đã gỡ | Thay SEED_PASSWORD không đổi user đã có. Hai username kế toán dùng cùng role Accountant, hiện không có grants; tên reviewer không tạo thêm quyền |
| Cấu hình và TLS | .env chia sẻ riêng; DB dùng verify-full và sslrootcert, BE hiện cần PGSSLROOTCERT nếu CA chưa được máy tin cậy | Đường dẫn CA cần chỉnh theo máy. Launcher chưa chuyển sslrootcert sang Npgsql; HTTPS dev cert khác CA PostgreSQL |
| Quản trị và phần chưa làm | API users/departments/roles/permissions đã có source, chưa có UI quản trị đầy đủ | Không có OTP/email thật, API nghiệp vụ hoặc audit interceptor TASK-024 từ thay đổi này. Không coi log vận hành là audit nghiệp vụ |

## 2026-11-02 - Chuẩn hóa hướng dẫn sau khi pull và đề xuất commit

- Viết lại README gốc theo luồng nhận .env qua kênh bảo mật → cấu hình CA theo máy → cài dependency → đọc trạng thái DB → chạy FE/BE. Không lưu giá trị cấu hình thực vào tài liệu.
- Đồng bộ hướng dẫn fullstack, TLS và README từng phần: phân biệt DB chung đã có dữ liệu với DB mới; không yêu cầu mỗi thành viên migrate/seed khi pull. Dùng verify-full thống nhất, ghi rõ PGSSLROOTCERT và precedence của launcher.
- Bỏ tài khoản mock thiếu role trong danh sách README cũ; liệt kê 9 username demo và phân biệt reset dữ liệu riêng với fixture seed mới. Ghi rõ API mode chưa mở các màn nghiệp vụ và dashboard còn dữ liệu minh họa.
- Phân nhóm source/tài liệu theo 7 commit để review; thay đổi .codegraph ngoài TASK-022/023 được giữ riêng. Bản chia commit chỉ dùng trong trao đổi với nhóm, không đưa vào repo theo yêu cầu người dùng.
- Lượt này chỉ cập nhật tài liệu; không thay code runtime hoặc dữ liệu DB. Kết quả kiểm tra tài liệu và launcher được ghi tại [test cases](../../testing/test-cases/identity.md).

## 2026-11-02 - Giữ phiên API khi mở màn nghiệp vụ chưa có API

- TASK-022/023, PB-02, Phase 6: sửa lỗi demo.sales.manager đăng nhập thật rồi mở Hợp đồng bị FE báo vô hiệu hóa. Nguyên nhân: contractsApi gọi mockListContracts → actionAuthorize/authorize → mockCheckSession; UUID thật không có trong seed prototype nên mock trả disabled và màn nghiệp vụ kết thúc phiên FE.
- Chọn giữ phiên và hiển thị chức năng chưa sẵn sàng trong API mode. BusinessRoute bọc 26 route Khách hàng/Khu vực/Hợp đồng/Phê duyệt/Workflow, gồm đường dẫn mở thẳng vào hồ sơ. Kiểm tra permission trước; chỉ mount màn nghiệp vụ mock trong mock mode. Không ánh xạ UUID thật sang seed, không sửa kiểm tra quyền hoặc triển khai API nghiệp vụ.
- RequireAuth và SessionProvider tiếp tục quản lý phiên qua authApi/BE. 403 giữ phiên; phản hồi phiên hết hạn/vô hiệu hóa từ BE vẫn kết thúc phiên. Đổi mật khẩu và các route Identity giữ cơ chế API hiện tại.
- Kiểm chứng trên Node 24.22.1: TypeScript noEmit PASS; Vite production build PASS (cảnh báo bundle trên 500 kB); 15/15 FE tests PASS. Năm test mới dùng React SSR/route thật, context đăng nhập giả lập và HTTP giả lập; kiểm tra 26 route với UUID thật, thiếu quyền, mock mode và BE báo phiên hết hạn/vô hiệu hóa. Không thay thế QA trình duyệt hay integration BE/PostgreSQL.
- Cập nhật trạng thái phase theo bàn giao và bằng chứng mới. Bcrypt interop trước đó bị abort vì testhost không kết nối sau 90 giây, không phải PASS; TASK-022/023 còn các gate integration/PostgreSQL. Không thay đổi DB hoặc commit/push/deploy trong lượt này.

## 2026-11-02 - Reset có chủ đích 9 tài khoản demo trên QTKD_DATH

- Người dùng đã cho phép reset 9 tài khoản demo về SEED_PASSWORD local và yêu cầu không bắt đổi mật khẩu lần đầu. Đây là thao tác dữ liệu được phê duyệt riêng, không phải hành vi tự động của seed.
- Phạm vi chính xác: demo.sales, demo.sales.manager, demo.operations, demo.operations.manager, demo.accountant, demo.accountant.reviewer, demo.legal, demo.board, demo.admin. Giữ nguyên role, phòng ban và quyền.
- Sau khi người dùng sửa SEED_PASSWORD đạt điều kiện seed, tạo bcrypt cost 12 cục bộ; cập nhật password_hash/password_changed_at, status=Active, failed_login_count=0, locked_until=NULL, must_change_password=false. Thu hồi mọi phiên chưa revoked của đúng 9 tài khoản bằng end_reason=Revoked, revocation_reason=password-changed.
- Thực hiện trong một transaction, khóa các user theo thứ tự user_id và kiểm tra đúng 9 bản ghi trước khi cập nhật. Không chạy lại seed hoặc migration; không thay đổi tài khoản ngoài danh sách.
- Đối chiếu sau commit: 9/9 hash khớp mật khẩu reset; 9/9 không bắt đổi lần đầu; 9/9 Active, bộ đếm bằng 0 và không còn khóa; 0 phiên chưa revoked. Xác minh SEED_PASSWORD mới nhất trong DB/.env vẫn khớp hash đã ghi. Không ghi mật khẩu/hash vào tài liệu hoặc log.
- Chưa kiểm chứng đăng nhập qua trình duyệt/API trong lượt reset này. Các bản ghi lịch sử bên dưới phản ánh trạng thái tại thời điểm kiểm tra tương ứng.

## 2026-11-02 - Đường dẫn CA Windows trong dotenv

- Tái hiện ENOENT dù certificate có tồn tại: dấu backslash trước chữ n trong đường dẫn Windows bị dotenv chuyển thành newline khi DIRECT_URL có ngoặc kép.
- Chỉ sửa tham số sslrootcert trong DB/.env local thành path dùng dấu / và percent-encoding; giữ nguyên credential. Xác nhận file tồn tại, đọc được X.509 và URI sau dotenv không có newline. Không ghi đường dẫn cá nhân hay secret vào log.
- Connection check đã qua lỗi ENOENT nhưng môi trường agent vẫn gặp ENOTFOUND trước TLS; chưa xác nhận kết nối hoặc seed thật thành công. Bổ sung lưu ý Windows vào hướng dẫn DATABASE-TLS.md.

## 2026-11-02 - Chẩn đoán seed P1011/TLS

- Kiểm chứng: npm run check PASS trên Node 26.13.0 (22/22 tests, validate/generate/typecheck, seed dry-run và DDL tĩnh). connection:check chạy thực tế trả mã ENOTFOUND, không in thông tin riêng tư; chưa xác nhận kết nối TLS thành công.

- Tách lỗi TLS P1011 khỏi warning DEP0205 và SSL-mode. Seed hướng người chạy tới connection:check thay vì chỉ báo kiểm tra cấu hình chung chung.
- Thêm npm run connection:check: dùng pg với DIRECT_URL, SELECT 1 và timeout; chỉ in mã lỗi trong allowlist/hướng dẫn cố định, không in raw error hay secret. Có test chống lộ thông tin và phân biệt DNS/TLS/auth.
- Cập nhật .env.example dùng verify-full, hướng dẫn tải CA đúng project và cấu hình sslrootcert. Không hạ xác minh TLS; không sửa mật khẩu/SSL enforcement/DB chung.
- Kết nối đọc từ môi trường agent bị ENOTFOUND trước TLS. Chưa tái hiện chi tiết TLS trên máy người dùng và chưa xác nhận seed thật thành công. Quy trình cho team: docs/setup/DATABASE-TLS.md.

## 2026-11-02 - Sửa lỗi chạy seed Prisma Client

- Nguyên nhân ERR_MODULE_NOT_FOUND: seed import client.js trong khi generator prisma-client xuất client.ts; thư mục generated cũng chưa được tạo trên máy chạy seed.
- Giữ generator hiện tại, dùng import .ts tại các điểm truy cập generated client, đặt moduleFormat=esm, generatedFileExtension=ts và importFileExtension=ts; TypeScript bật allowImportingTsExtensions cho noEmit.
- Thêm preseed để npm run seed tự generate. Gọi trực tiếp npx prisma db seed hoặc seed:check vẫn cần npm run generate trước.
- Sửa bộ so sánh migration để hiểu qualification qtkd, CRLF và khoảng trắng trong khóa chính ghép. Giữ kiểm tra kiểu/nullability/default, PK/FK/index/enum; không sửa SQL migration đã có.
- Kiểm chứng mới nhất: npm run check PASS trên Node 26.13.0 (validate, generate Prisma 7.10.1, typecheck, 19/19 tests, seed dry-run 29 bảng, static migration check). Dry-run cũng PASS trên Node 24.22.1. DEP0205 còn xuất hiện trên Node 26 nhưng không gây lỗi thoát.
- Không kết nối/ghi seed vào Supabase trong lượt sửa này; replay PostgreSQL, seed thật hai lần và integration BE vẫn chưa được kiểm chứng. Các mục dưới là lịch sử trước khi dependency DB đã có.

## 2026-11-02 — Chuẩn bị cấu hình và hướng dẫn fullstack

- Theo yêu cầu người dùng, tạo DB/.env, backend/.env và frontend/.env.local; giữ tất cả ngoài Git. Sinh JWT key và mật khẩu seed mới cục bộ, không ghi giá trị vào tài liệu/log/chat. DIRECT_URL chờ người dùng điền.
- Thêm Start-Api.ps1 và module đọc dotenv literal, chuyển PostgreSQL URI thành Npgsql connection string có quote đúng. Không thêm dependency .NET để nạp .env. Biến tiến trình được phục hồi khi API dừng.
- Test launcher/parser đạt: không thực thi giá trị dotenv, xử lý password URI-encoded/ký tự đặc biệt, session pooler, cổng/TLS/schema, precedence và fail-fast khi thiếu URL.
- Thêm docs/setup/LOCAL-FULLSTACK.md: Connect → cấu hình → restore/build/test → Prisma deploy/seed → chạy hai terminal. Chỉ đọc Supabase: đã có hai migration đầu và 9 tài khoản demo; không apply migration 0003 hay đổi mật khẩu DB chung. Seed mới không đổi password đã tồn tại.
- Phase 1–2 vẫn chờ full build/PostgreSQL replay; việc tạo .env và launcher không đánh dấu task hoàn tất.

## 2026-11-02 — TASK-022/023, Phase 0–6

Người giao task đã chốt các phương án Phase 0 và cho phép triển khai. ADR 0001–0003 là nguồn quyết định; trạng thái Accepted không có nghĩa đã nghiệm thu code.

| Thay đổi | Trước → sau | Ảnh hưởng |
| --- | --- | --- |
| Nền BE | Khung thư mục → bốn project .NET 10 và integration test host | Phối hợp TASK-049, không triển khai các module nghiệp vụ khác |
| Danh tính | Mock nhiều/không role → đúng một role bắt buộc | FE giữ roles array một phần tử; bỏ tài khoản mock thao.nt/khoa.pv |
| Quyền | FE tự tính → BE lưu và kiểm tra role_permission mỗi request | Role zero permission vẫn login; thiếu quyền trả 403 và giữ phiên |
| Phiên | userId/signedInAt do FE gửi → JWT sub/sid và phiên DB | API không tin định danh do client khai trong body |
| Logout | Mock chỉ ghi log → thu hồi phiên server và xóa cookie | Cookie có proof logout ổn định để không mất logout khi refresh xoay token đồng thời |
| Mật khẩu | bcrypt seed chưa có consumer → Identity Core custom store/hasher | Đổi mật khẩu tối thiểu; thu hồi phiên khác; OTP recovery vẫn chỉ trong mock mode |
| Migration | 26 bảng dictionary → bổ sung 3 bảng quyền và metadata Identity | Migration 202611020003_identity, giữ nguyên hai migration cũ; chưa apply DB chung |
| Kiểm thử | Chưa có → WebApplicationFactory, JWT thật, SQLite cho kiểm tra API offline và tùy chọn Supabase test riêng | SQLite không chứng minh enum/RLS/row locking của PostgreSQL |

## Quyết định chi tiết trong quá trình triển khai

- DTO roles giữ đúng một phần tử để giảm thay đổi FE. Quyền lấy từ trường permissions của API, không fallback sang FE khi API thiếu trường đó.
- Hai secret trong refresh cookie chỉ lưu hash trong DB. Proof logout không được dùng để refresh. Lý do: logout dùng cookie cũ phải thu hồi được phiên kể cả một refresh đã commit trước đó.
- Một refresh cookie hiện hành cho mỗi trình duyệt. Login mới trong cùng cookie jar thu hồi phiên trước; thiết bị/cookie jar khác không bị logout theo.
- Logout ghi cờ metadata cục bộ ngay khi bắt đầu; reload sau lỗi mạng không tự restore bằng cookie chưa thu hồi. Login chủ động mới gỡ cờ. HTTP client chặn refresh/request mới sau logout và bỏ phản hồi refresh thuộc phiên trước.
- API quản trị chưa xóa tài khoản/phòng ban/role; dùng status và grants để giữ tham chiếu lịch sử. Role catalog cố định theo tám role của dictionary.
- Giới hạn quản trị: không tự đổi role/phòng ban/status của mình, không vô hiệu hóa admin cuối, không bỏ quyền quản trị thiết yếu của SystemAdmin.
- Chỉ UserManager cho thao tác user/password/email; role/grants qua IIdentityService, không dùng RoleManager/IUserRoleStore mặc định.
- Log vận hành JSON chứa TraceId/ActorId, không ghi body, password, token hoặc connection string; chưa thay thế audit interceptor TASK-024.
- Các thao tác khóa user phải reload entity đang được EF theo dõi sau khi lấy row lock, tránh dùng password/role cũ đã được middleware đọc trước một request đồng thời. Có test tái hiện stale tracking; chưa chạy integration.

## Trạng thái kiểm chứng tại lượt triển khai ban đầu (lịch sử)

Domain/Application đã build. Native tests: FE HTTP/session 10/10, DB source/matrix 4/4 đạt. Restore API/test bị chặn bởi NuGet DNS; npm ci offline thiếu package. Chưa chạy integration test BE, full FE typecheck/build, Prisma validate hoặc migration trên DB test. Chi tiết và lệnh chạy lại: ../../testing/test-cases/identity.md.

Không có commit/PR được tạo tự động; liên kết PR và kết quả CI bổ sung khi nhóm review.
