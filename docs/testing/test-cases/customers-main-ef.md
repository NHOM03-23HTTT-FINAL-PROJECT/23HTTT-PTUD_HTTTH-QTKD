# Kiểm thử khách hàng sau ghép main và chuyển migration sang EF Core

Ngày kiểm thử: **05/11/2026**. Nhánh: `cus-flow`; main được ghép: `93b5447`. Phạm vi theo yêu cầu: chuyển migration khách hàng sang EF, gỡ backend SYS-CUS-03, giữ nguyên frontend của main, kiểm thử, không push và không ghi Supabase dùng chung.

Căn cứ kỹ thuật: [DB/README](../../../DB/README.md), [STRUCTURE](../../architecture/STRUCTURE.md), [API khách hàng](../../specs/customers/list_api-customer.md). Mã SYS-CUS-03 là tạm ngưng (US-CUS-04); SYS-CUS-04 là kích hoạt lại (US-CUS-05). Không nhầm số SYS với US.

## Thay đổi và kết quả migration

- Xóa ba migration khách hàng ở `DB/prisma/migrations`; thêm migration EF **20261105104547_CustomerFlow**, Designer và snapshot được sinh bằng `dotnet ef migrations add`.
- Bốn bảng mới: `customer_profile_data` (dịch vụ có cấu trúc, metadata tạo/sửa), `customer_operation` (biên nhận chống xử lý trùng), `customer_status_outbox` (yêu cầu thông báo), `customer_status_delegation` (ủy quyền cá nhân).
- Ba cột mới: `customer.customer_updated_at`, `customer.flow_revision`, `customer_status_decision.review_metadata`.
- Giữ CHECK, FK, index, trigger chặn sửa mã/MST, tăng version, RLS và thu hồi quyền trực tiếp của anon/authenticated. Enum Suspend/Suspended và quyết định cũ không bị xóa.
- Không gán ngày tạo/người tạo giả cho khách cũ. Các bảng vận hành mới được phép rỗng khi seed. Migration mới đi theo hướng bổ sung; Down từ chối xóa lịch sử.
- Cơ sở dữ liệu mới có **36 bảng ứng dụng, 329 cột, 115 khóa/FK, 136 index, 3 sequence, 20 enum**, ngoài bảng lịch sử EF. Sau migrate: **11 applied, 0 pending**.
- `has-pending-model-changes`: không có thay đổi model chưa được migration.

| Ca | Kết quả thực chạy |
|---|---|
| DB trống → QTKD.DbTool migrate → seed hai lần → status | PASS; mật khẩu và bản ghi cũ không bị reset. |
| Model EF so với SQL migration | PASS; bảng/cột/kiểu/default/PK/FK/index/sequence/enum khớp. |
| Schema main EF + dữ liệu customer/decision/audit cũ → migration customer | PASS; dữ liệu trước giữ nguyên, không tạo metadata/operation/outbox/delegation giả. |
| Chạy migrate lại | PASS; không có migration chờ, không chạy DDL lần nữa. |
| DB baseline Prisma → migrate khi chưa adopt | PASS; bị từ chối theo guard của main. |
| Adopt hai lần → migrate | PASS; adopt lần hai không ghi, chỉ chạy hai migration EF mới. |
| RLS bốn bảng và quyền SELECT/INSERT/UPDATE/DELETE của anon/authenticated | PASS trên PGlite; bốn bảng bật RLS, hai role không có quyền trực tiếp. |

Các ca trên dùng PostgreSQL riêng: PGlite và container PostgreSQL 18.1 ở loopback. Không dùng env Supabase. ON UPDATE của FK không nằm trong phép so parity vì EF không biểu diễn được; CHECK/trigger/RLS được kiểm tra từ SQL và các ca PostgreSQL. Chưa kiểm chứng pooler/TLS/role vận hành của Supabase thật.

Nếu một DB khác từng áp ba migration Prisma khách hàng của cus-flow cũ, công cụ adopt của main vẫn từ chối migration ngoài baseline. Không sửa lịch sử hoặc chạy lại DDL để vượt guard; đường nâng cấp đó cần đối chiếu schema riêng trước khi áp.

## API và nghiệp vụ

Controller khách hàng dùng `ICurrentActor`, policy và `RequireCsrf` chung của main. CORS bổ sung PATCH cho cập nhật khách hàng. Validator thuần ở Application; phần truy vấn/giao dịch của service hiện vẫn là Npgsql cũ, chưa phải mẫu Service → Repository EF LINQ đầy đủ trong STRUCTURE. Đây là chuyển nguồn migration, không phải chuyển toàn bộ runtime ORM.

| Ca / nhóm ca | Công cụ | Kết quả |
|---|---|---|
| Tạo hồ sơ hợp lệ, chuẩn hóa, giữ số 0 đầu MST, cần điện thoại hoặc email | Unit + API PostgreSQL | PASS |
| MST trùng Active/Suspended, trùng ngoài phạm vi | API PostgreSQL | PASS về chặn tạo; ngoài phạm vi không lộ hồ sơ |
| Retry cùng khóa; cùng khóa khác nội dung; gửi đồng thời | API PostgreSQL | PASS |
| Cấm ghi mã/MST/chủ hồ sơ/trạng thái/version từ request | API PostgreSQL | PASS |
| Nhân viên cùng phòng xem được, chỉ chủ hồ sơ sửa; trưởng phòng sửa trong phòng | API PostgreSQL | PASS |
| Ngoài phòng không thấy bản ghi/số lượng và không mở được link trực tiếp | API PostgreSQL | PASS |
| Sửa có lý do, tăng version; no-change; hai request cùng version | API PostgreSQL | PASS |
| Audit và lịch sử lưu đúng số lần; dữ liệu legacy giữ nguyên | API PostgreSQL | PASS |
| Tìm không dấu, bộ lọc, sort, trang 8+2 dòng không trùng | API PostgreSQL | PASS |
| Mặc định chỉ Active, chọn all thấy Suspended; tham số sai/từ khóa kiểu SQL | API PostgreSQL | PASS |
| Thiếu JWT, sai phòng/quyền, CSRF, thu hồi quyền giữa chừng | API PostgreSQL + pipeline C# | PASS |
| SYS-CUS-03 GET review và POST suspend đã gỡ | API PostgreSQL + pipeline C# | PASS: 404, không đổi dữ liệu |
| Cấp ủy quyền suspend đã gỡ; canSuspend luôn false | API PostgreSQL + pipeline C# | PASS |
| Kích hoạt lại: không quyền/sai chủ hồ sơ/version/lý do/khóa/tệp chưa lưu | Pipeline + PostgreSQL | PASS về từ chối |
| Nguồn thiếu, nguồn không cho phép, thiếu căn cứ, lời khai ngoại lệ giả | Pipeline + PostgreSQL | PASS về từ chối, dữ liệu giữ nguyên |
| Kích hoạt lại thành công, retry, cạnh tranh, lưu lịch sử/quyết định/outbox/receipt | Nguồn kiểm soát + PostgreSQL | PASS; không phải nguồn xác minh thật |
| Ép insert outbox lỗi | Pipeline + PostgreSQL | PASS: hoàn tác trạng thái/quyết định/audit/receipt |
| Cấp quyền riêng, trùng grant, sai người/phòng, hết hạn, thu hồi/retry | Pipeline + PostgreSQL | PASS |
| Hết hạn trong lúc tải nguồn; thu hồi trong lúc yêu cầu đang chạy | Pipeline + PostgreSQL | PASS; kiểm tra lại và tuần tự hóa theo transaction |
| Chọn khách Active trong phòng và tạo hợp đồng Draft thật | API PostgreSQL | PASS |
| Khách Suspended/ngoài phòng bị loại khỏi lookup và bị chặn POST hợp đồng | API PostgreSQL | PASS |
| Thu hồi customers.view trong khi đang tạo hợp đồng | API PostgreSQL | PASS: không tạo hợp đồng |
| Hồi quy toàn bộ module hợp đồng của main | PGlite + API | PASS: 23/23 kiểm tra |

Kết quả toàn bộ backend: **63 unit test PASS** (18 ca validator khách hàng), **128 integration test PASS** (gồm ba bài customer PostgreSQL), **4 SKIP**. Bốn bài skip là ba suite rollback Supabase và ca refresh đồng thời cần cấu hình test DB riêng của Identity; không thay bằng kết quả local để báo đã test Supabase.

## Frontend nguyên trạng main

Đối chiếu Git: không có khác biệt trong toàn bộ thư mục `frontend/` so với main đã ghép. `npm run build` PASS; `npm run test:auth` PASS **24/24**. Vite vẫn cảnh báo bundle lớn hơn 500 kB.

Browser test thật bằng Chrome trên bản main, với dữ liệu prototype: **11 PASS / 2 FAIL**.

| Ca UI | Kết quả |
|---|---|
| Validate tạo: trường rỗng và thiếu liên hệ | PASS |
| Tạo → chi tiết được lưu trong kho mock | PASS |
| Sửa, khóa MST, lý do, lịch sử | PASS |
| Chặn MST trùng trong prototype | PASS |
| Tìm đúng một hồ sơ theo MST và không có kết quả | PASS |
| Chuyển tab hợp đồng/bảng giá/thanh toán/lịch sử | PASS |
| Không có lỗi JavaScript chưa xử lý | PASS |
| Phân trang và đổi bộ lọc trạng thái | PASS |
| Rà soát tạm ngưng trên desktop | PASS, chỉ mock |
| Xác nhận tạm ngưng của prototype main | PASS, không có backend SYS-CUS-03 |
| Kích hoạt lại với xác nhận mẫu và tệp mẫu | PASS, chỉ mock |
| Rà soát ở viewport 390 px | **FAIL: impact-card cao 2 px**, nội dung bị co/che |
| Nội dung ở viewport 390 px | **FAIL: chiều ngang tài liệu 731 px**, tràn khỏi viewport 390 px |

Đăng nhập API thật bằng tài khoản synthetic trên PostgreSQL local: đã mở thử danh sách, tạo, chi tiết và sửa. Cả bốn màn hiện **“Chức năng chưa sẵn sàng”** do BusinessRoute của main; không mount kho mock và không gọi API customer. Guard hoạt động đúng nhưng luồng customer UI với backend thật **chưa tích hợp**. Main cũng chưa có màn quản lý ủy quyền cá nhân. Không đánh dấu UI E2E backend khách hàng đạt từ các ca prototype.

Ảnh và JSON kết quả trên máy: `D:/VSCode/PTUDHTTTHD/.qtkd-tools/customer-main-ui/`, gồm `created-main.png`, `profile-main.png`, `suspension-main-1440.png`, `suspension-main-390.png`, `api-mode-main-guard.png`, `report.json`, `api-mode-report.json`. Test có exit code 1 vì hai lỗi mobile đã ghi nhận; không sửa UI theo yêu cầu giữ main.

## Khoảng trống còn lại so với nghiệp vụ đầy đủ

- SYS-CUS-03 backend bị loại theo yêu cầu, không phải hoàn tất bằng code mới.
- SYS-CUS-04: nguồn xác minh thực tế và kho tệp chưa nối; nguồn thật vẫn chặn chuyển trạng thái. Các ca thành công chỉ chứng minh cơ chế bằng nguồn test.
- SYS-CUS-06: tab hồ sơ liên quan chưa nối nguồn thật, kể cả hợp đồng đã có phân hệ; price list/payment/report discrepancy còn phụ thuộc. API báo thiếu nguồn, không trả danh sách giả như đã xác minh.
- SYS-CUS-01 A5.3: thiếu liên kết tới hồ sơ trùng khi được phép xem; hiện API chỉ trả mã lỗi.
- Outbox trạng thái chưa có worker đưa thông báo vào Notifications/gửi lại. Có bảng Notifications trên main không tự hoàn tất tích hợp này.
- Runtime customer còn service Npgsql trong Infrastructure; không tuyên bố đã đạt mẫu Repository EF LINQ đầy đủ. Migration/model/snapshot đã chuyển sang EF.
- Hai lỗi UI mobile trên main được giữ nguyên. UI API chưa được nối như mô tả trên.

## Chạy lại

1. Dùng SDK theo `backend/global.json`, dotnet-ef 10.0.14, `npm ci` trong DB và frontend; `dotnet restore --locked-mode`, build backend.
2. Trong DB chạy `npm run check` và `npm run test:contracts`. Các bộ này tự dựng PGlite, không đọc env Supabase.
3. Dựng PostgreSQL loopback riêng, áp migration/seed bằng QTKD.DbTool với `--disposable-local --env <file-rỗng>` và DIRECT_URL local rõ ràng.
4. Chạy backend test với `QTKD_CUSTOMER_TEST_DISPOSABLE=true`, `QTKD_CUSTOMER_TEST_PORT=<port>`; bộ customer chỉ dùng host loopback, DB qtkdtest và thông tin test cố định trong file test. Không đặt biến DB dùng chung cho suite này.
5. Chạy API Testing trên 127.0.0.1:7156 trỏ DB test, rồi `node backend/tests/customer-flow-postgres.mjs` với hai biến trên.
6. UI mock: chạy Vite với VITE_AUTH_MODE=mock; đặt QTKD_PLAYWRIGHT_PACKAGE, QTKD_BROWSER_PATH, QTKD_UI_ARTIFACTS và QTKD_UI_BASE rồi chạy `node backend/tests/customer-main-ui.mjs`.
7. UI API: chạy Vite với VITE_AUTH_MODE=api và QTKD_API_PROXY trỏ API test; chạy `customer-main-api-ui.mjs` với tài khoản/mã customer synthetic do script API vừa tạo. Base dùng localhost:5173 theo CORS local.

Không có thao tác push hoặc apply migration lên Supabase dùng chung trong lần kiểm thử này.
