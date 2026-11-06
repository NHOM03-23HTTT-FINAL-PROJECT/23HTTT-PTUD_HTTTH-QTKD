# Kiểm thử UI khách hàng qua API

## Hiện tại: đã bổ sung lại SYS-CUS-03

Theo yêu cầu mới sau khi mở PR #33, backend tạm ngưng đã được bổ sung lại cùng API/UI và quyền cá nhân. Đã chạy lại sau khi ghép main `e9deffe`: **55 mục customer tự động PASS** gồm 21 unit, 12 integration, 2 adapter frontend, 20 kịch bản browser; toàn bộ unit backend 100/100 và frontend 36/36 cũng PASS. Chi tiết, lỗi bảng rà soát đã sửa và phần nguồn thật còn thiếu ở [báo cáo tạm ngưng](customer-suspension.md). Những ghi nhận backend SYS-CUS-03 đã gỡ bên dưới là lịch sử kiểm thử tại `42445dd`, được thay thế bởi cập nhật này.

## Lịch sử kiểm thử 06/11/2026 tại 42445dd: ghép main và Repository EF Core

Main được ghép tại `65d3092` (gồm bản refactor hợp đồng mới), nhánh `cus-flow`, chưa push. Xung đột Program/CORS/DI được giải quyết bằng cách giữ đăng ký Customer và Area; giữ repository hợp đồng của main. Chỉ đưa lại các kiểm tra tham chiếu khách hàng hợp lệ vào ranh giới chọn khách khi tạo/sửa hợp đồng, không khôi phục store Npgsql cũ của hợp đồng.

### Cấu trúc và hành vi đã kiểm chứng

- `CustomersController` → `Application/Features/Customers/Services/CustomerService` → `ICustomerRepository`/`Infrastructure/Repositories/CustomerRepository` trên `QtkdDbContext`. DTO chuyển vào Dtos; validator vẫn ở Application; records persistence-neutral ở Domain. Ba service Npgsql cũ trong Infrastructure đã xóa. Interface nguồn xác minh không còn nhận connection/transaction của provider.
- CRUD, phạm vi, tìm kiếm, lọc, phân trang, audit/receipt/quyết định/ủy quyền dùng EF LINQ. SQL đặc thù khóa advisory/row lock và đồng hồ PostgreSQL nằm trong repository. Giữ transaction, chống retry trùng, so phiên bản và rollback khi outbox lỗi. Filter lỗi persistence chỉ áp dụng customer, giữ phản hồi 409/503 mà không sửa cách xử lý lỗi các module khác trên main.
- Main đăng ký hai CLR enum cho cùng `qtkd.active_status`, gây lỗi khi dựng EF model. Customer chuyển enum legacy sang provider enum Domain dùng chung với Area; bỏ đăng ký PG trùng. Metadata được scaffold lại qua EF, không chỉnh nghiệp vụ Area.
- Migration `20261106095056_CustomerEfRepositoryAlignment` có Up/Down rỗng: đồng bộ snapshot với CLR mapping sau ghép main, **không thay bảng, cột, kiểu dữ liệu, giá trị mặc định hoặc dữ liệu**. Test kiểm tra trực tiếp UpOperations/DownOperations đều rỗng. Supabase đã áp migration này: **13 applied, 0 pending**, giữ migration riêng của nhóm.
- Sửa assertion cũ của script business theo `detail.existing = null`. Bổ sung unit test service, integration LINQ SQLite và 3 ca UI cho cảnh báo rời form/cửa sổ hẹp. Ca lọc khách Suspended tìm đúng MST fixture để không phụ thuộc trang đầu của dữ liệu từ bộ test khác.
- UI danh sách trước đây ép cột tên về 0 khi cửa sổ hẹp, làm hàng rất cao. Chỉ sửa CSS bảng customer để cuộn ngang trong thẻ kết quả, giữ cột tên đọc được. Không đổi bố cục app dùng chung.

### Kết quả lần chạy cuối

| Phạm vi | Kết quả |
|---|---|
| Customer unit: 18 validator + 3 service | **21/21 PASS** |
| Customer integration: 4 PostgreSQL + 3 SQLite repository | **7/7 PASS** |
| Customer frontend adapter MST trùng | **1/1 PASS**, nằm trong bộ frontend 26/26 PASS |
| UI → API → PostgreSQL customer | **19/19 PASS** |
| Script business API/SQL customer | **PASS**: tạo/sửa, MST duy nhất, phạm vi, retry/đồng thời, audit, khách legacy, endpoint đã gỡ, nguồn thiếu và chọn khách hợp lệ cho hợp đồng |
| Build BE / FE | **PASS**; FE còn cảnh báo bundle lớn, backend còn cảnh báo đã có từ main |
| `npm run check` trong DB | **PASS**: 3 offline test, EF parity, migrate/seed lặp, nâng cấp DB main và adopt baseline; dữ liệu cũ giữ nguyên |
| Computer use với API EF nối Supabase | **PASS**: đăng nhập, danh sách, tìm không dấu `anh duong` ra Ánh Dương, chặn MST trùng/mở hồ sơ, Back giữ dữ liệu, bảng cửa sổ hẹp |

Tổng riêng customer hiện có **48 mục test/kịch bản tự động** (21 + 7 + 1 + 19); script business và các thao tác CUA được ghi riêng để tránh cộng trùng. SQLite không chứng minh enum/khóa PostgreSQL hoặc Unicode LOWER; những phần đó có test PostgreSQL/script business và thao tác Supabase.

**Bộ test toàn repo chưa xanh:** unit 87 PASS; integration 92 PASS, **25 FAIL**, 4 SKIP. Chạy main nguyên bản trong worktree tách biệt cho thấy cả 25 tên test lỗi này cũng lỗi trên main (OpenAPI, rate limit khôi phục mật khẩu, ReviewFailure/phê duyệt). Lần đối chiếu đầu có thêm 1 lỗi Bcrypt interop do thiếu dependency Node; sau bổ sung dependency đã có, ca đó chạy lại PASS, không sửa code Identity. `regression-delta.json` ghi **0 lỗi mới** so với main. Không sửa nghiệp vụ Identity/phê duyệt ngoài phạm vi; không tuyên bố toàn repo đã pass.

DB PostgreSQL test chạy trong tmpfs, API/UI test riêng cổng 7157/5174; sau kiểm thử đã dừng/xóa. Không có volume DB bền vững; cổng 55441/7157/5174 đã đóng. Cổng 5173/7156 tiếp tục chạy API thật nối Supabase từ env được cung cấp. Supabase trước/sau có cùng 10 khách, 2 quyết định, 46 audit và fingerprint; các bảng profile/operation/outbox/delegation vẫn 0 dòng. Không seed, sửa khách hoặc chuyển dữ liệu test lên DB chung.

Bằng chứng: `D:/VSCode/PTUDHTTTHD/.qtkd-tools/customer-ef-main-20261106/`: TRX, `test-comparison.json`, `regression-delta.json`, `business.log`, `db-check.log`, `ui-final/api-ui-report.json`, ảnh CUA, snapshot Supabase trước/sau và `cleanup.json`.

SYS-CUS-03 backend tiếp tục bị gỡ. Ca kích hoạt lại thành công chỉ được chứng minh với ControlledSource trên DB test; nguồn xác nhận thật, hồ sơ liên quan và worker outbox vẫn là phụ thuộc. Đây không phải bản nghiệm thu đầy đủ những phần đang thiếu nguồn.

## Kết quả trước khi ghép main 06/11/2026: thông báo và kết nối Supabase

Theo yêu cầu mới, phạm vi sửa chỉ gồm khách hàng và các UC đã thống nhất. Nhánh `cus-flow`; chưa commit các sửa đổi của lần này, không push. Dashboard, bố cục mobile dùng chung và giao diện chọn khách trong hợp đồng nằm ngoài phạm vi sửa lần này.

- Bổ sung cảnh báo rời trang cho form tạo/sửa: chuyển menu hoặc Back khi có thay đổi phải chọn tiếp tục chỉnh sửa hay rời trang. Tiếp tục giữ nguyên dữ liệu; lưu thành công và xác nhận Hủy không xuất hiện hộp thoại lần hai. Không bổ sung tự lưu bản nháp hoặc khôi phục bản nháp sau khi hết phiên.
- API MST trùng trả mã/tên/trạng thái tối thiểu của hồ sơ trong phạm vi được xem; ngoài phạm vi không trả hồ sơ. FE dùng nút **Mở hồ sơ hiện có** sẵn có. Cả Active và Suspended vẫn bị chặn trùng; không tự kích hoạt lại khách Suspended. Nhánh xử lý lỗi dùng savepoint, không ghi operation/audit khi tạo thất bại.
- Đã áp dụng migration EF Core `20261105104547_CustomerFlow` vào Supabase bằng DbTool; không seed/reset hoặc đưa dữ liệu thử local lên DB dùng chung. Migration bổ sung `customer_updated_at`, `flow_revision`, `review_metadata`, bốn bảng profile/operation/outbox/delegation, các ràng buộc/chỉ mục và RLS; cập nhật hàm bảo vệ định danh/version. Không tạo migration mới trong lần sửa thông báo.
- Supabase sau kiểm tra có **12 migration đã áp dụng, 0 chờ**. Migration `20261106000100_RevokeSalesManagerAssign` đã có của nhóm được giữ nguyên. Mười khách hàng (8 Active, 2 Suspended), hai quyết định và 43 audit giữ nguyên so với trước migration, so sánh cả fingerprint dữ liệu. Bốn bảng mới bật RLS và chưa có dòng dữ liệu.
- Runtime hiện dùng `frontend/.env.local` với `VITE_AUTH_MODE=api`, backend dùng kết nối từ `DB/.env DIRECT_URL` tới Supabase. Không có fallback API sang DB test hay kho mock. Mã prototype của main và mã kiểm thử được giữ trong source, không phải DB đang chạy.
- Đã xóa container DB test khách hàng `qtkd-customer-manual-20261105` và volume ẩn danh của nó; cổng 55439 không còn lắng nghe. Các tài khoản `test.customer.*` chỉ thuộc DB đã xóa. Giữ bằng chứng ảnh/kết quả, không giữ bản dump DB. Không dừng/xóa PostgreSQL hoặc container của dự án khác.

### Kiểm tra của lần cập nhật

| Kiểm tra | Kết quả / giới hạn |
|---|---|
| Build frontend | PASS; còn cảnh báo bundle lớn |
| Bộ kiểm tra frontend `test:auth` | 25/25 PASS, gồm ca mới ánh xạ metadata MST trùng |
| Bộ kiểm tra backend | 63 unit PASS; 129 integration PASS, 4 SKIP cần môi trường riêng; chạy trước khi xóa DB test |
| MST trùng: own/đồng nghiệp cùng phòng, Suspended, ngoài phòng | Integration PASS: chỉ trả hồ sơ trong phạm vi; không ghi operation/audit |
| CUA: rời form tạo qua menu và Back | PASS: hiện cảnh báo; tiếp tục giữ dữ liệu, rời trang đi đúng đích |
| CUA: form sửa, tiếp tục rồi lưu | PASS: giữ dữ liệu, lưu phiên bản 4 → 5 và audit `CUSTOMER_UPDATED`; không hỏi rời trang sau khi lưu |
| CUA: MST trùng và nút mở hồ sơ | PASS trên API test; mở KH-000076 sau đúng một xác nhận rời form |
| CUA trên Supabase: đăng nhập `demo.sales`, danh sách và phân trang | PASS: mặc định 8 Active, bộ lọc tất cả có 10 và trang hai có 2 dòng |
| CUA trên Supabase: tạo trùng MST Active / Suspended | PASS: 409, nút mở KH-000001 / KH-000002; không tạo hồ sơ hay quyết định mới |
| CUA trên Supabase: chi tiết, lịch sử, mở menu thao tác | PASS; lịch sử trạng thái cũ hiển thị đúng, menu mở/đóng được |
| Theo dõi DB sau ca UI Supabase | PASS: số lượng và fingerprint khách/quyết định/audit giữ nguyên; operation/profile/outbox/delegation đều 0 |
| Lỗi trình duyệt/backend trong ca cuối | Không thấy lỗi JavaScript hoặc `REQUEST_FAILED`; còn các cảnh báo nâng cấp React Router trong development |
| Cấu hình / dọn DB test | PASS: cấu hình khởi động bình thường chọn Supabase; container và volume test đã xóa |

Các ca ghi dữ liệu thành công và xung đột được chạy trên DB test trước khi xóa. Trên Supabase kiểm tra đọc và ca tạo bị từ chối vì trùng MST; không báo đã thử tạo/sửa thành công trên DB dùng chung. Ca MST bị từ chối có thể làm sequence mã tăng, không tạo hồ sơ.

Bằng chứng computer use và đối chiếu DB: `D:/VSCode/PTUDHTTTHD/.qtkd-tools/customer-supabase-20261106/` (9 ảnh JPG, `supabase-before.json`, `supabase-after-migration.json`, `supabase-final.json`, `local-cleanup.json`). Đối chiếu lần sửa thành công trước khi xóa DB: `customer-cua-20261106/db-after-notification-fixes.json`.

## Kết quả lần tích hợp 05/11/2026 (lịch sử)

Nhánh `cus-flow`. Tiếp nối [ghép main và migration EF](customers-main-ef.md). Phạm vi lúc đó: nối UI với backend thật, giữ bố cục main, giữ backend SYS-CUS-03 đã gỡ, không push và không ghi Supabase dùng chung. Môi trường local mô tả bên dưới đã được xóa trong cập nhật 06/11 ở trên.

## Hành vi đã nối

- Danh sách/tìm kiếm/lọc/phân trang, tạo, sửa, chi tiết và lịch sử lấy dữ liệu qua API. Tải lại trang vẫn đọc đúng dữ liệu PostgreSQL; không dùng kho mock cho danh tính API.
- JWT/refresh/logout/CSRF dùng client chung. Actor, thời gian đăng nhập, người phụ trách và trạng thái không được gửi như dữ liệu ghi do client tự chọn. Tạo/sửa giữ Idempotency-Key khi thử lại.
- Hồ sơ ngoài phạm vi bị che; sửa kiểm tra quyền sở hữu tại UI và backend. Dữ liệu cũ không hiển thị trong lúc đổi hồ sơ hoặc phiên. Kết quả tải chậm của trang trước không ghi vào trang sau.
- Xung đột phiên bản mở dialog với hồ sơ mới nhất; tải lại giữ thay đổi độc lập, rồi lưu bằng version/key mới.
- Trưởng phòng có màn `/khach-hang/uy-quyen`, mở từ danh sách: chọn người, thời hạn và ghi chú; cấp/thu hồi quyền kích hoạt lại qua API. Nhân viên thường không vào được màn quản lý. Không cấp quyền Suspend.
- Kích hoạt lại đã nối GET context/POST action; UI dùng quyền và căn cứ từ server, không tự coi lời khai ngoại lệ hoặc tên tệp là xác nhận thật.
- Tạm ngưng ở chế độ API báo chưa sẵn sàng và không gọi endpoint đã gỡ. Prototype chỉ chạy nếu chọn rõ `VITE_AUTH_MODE=mock`.
- Metadata legacy thiếu ngày/người tạo hiển thị chưa rõ; không dựng thời điểm tạo hoặc lịch sử giả. Nhóm hồ sơ thiếu nguồn báo phụ thuộc, lỗi quyền báo thiếu quyền, lỗi mạng có thể thử lại.

Không chuyển runtime backend Npgsql sang repository EF trong lần nối UI này; không có migration mới.

## Kiểm chứng thực tế

Chạy Chrome headless trên `http://localhost:5173`, cùng mã API thật và PostgreSQL 18.1 local đã áp 11 migration EF. Test tạo tài khoản/hồ sơ synthetic có prefix riêng, đối chiếu UUID đăng nhập với DB local trước khi ghi. Không bật ControlledSource hay đọc env Supabase.

Script: `backend/tests/customer-main-api-ui.mjs`.

| Ca | Kết quả |
|---|---|
| Danh sách đọc hồ sơ local và không hiện khách prototype | PASS |
| Validate tạo ở UI, chưa gửi dữ liệu sai | PASS |
| Tạo → chi tiết → reload, kiểm tra owner/version/MST/audit thực trong PostgreSQL | PASS |
| Tìm theo MST, không có kết quả, trạng thái, phân trang 8+2 từ API | PASS |
| MST trùng bị API từ chối, DB chỉ có một hồ sơ | PASS |
| Sửa giữ MST, tăng version, ghi lý do/lịch sử thật | PASS |
| Đồng nghiệp xem được nhưng không sửa; ngoài phạm vi không lộ hồ sơ | PASS |
| Hai phiên sửa cạnh tranh: nhận 409, đối chiếu bản mới, giữ thay đổi độc lập | PASS |
| Các tab liên quan báo đúng nguồn chưa nối/quyền thiếu; không lấy mock | PASS |
| Giả lập 503: có lỗi và retry, giữ đăng nhập, không dùng dữ liệu mẫu | PASS |
| Cho server lưu rồi làm mất phản hồi: retry cùng key, DB chỉ tạo một khách | PASS |
| Trưởng phòng cấp/thu hồi quyền bằng UI, chặn thời hạn quá khứ; nhân viên được giao mở context, thiếu xác minh thì nút khóa; thu hồi xong không còn quyền | PASS |
| Nhân viên thường không mở hoặc gọi API quản lý ủy quyền từ UI | PASS |
| Màn tạm ngưng API chưa sẵn sàng, không gọi endpoint bị gỡ, trạng thái không đổi | PASS |
| Khách Active vừa tạo chọn được cho hợp đồng thật; Suspended không có trong lookup | PASS |
| Không có lỗi JavaScript chưa xử lý | PASS |

**16/16 ca browser PASS.** `npm run build` PASS; `npm run test:auth` PASS **24/24**, gồm kiểm tra route API, quyền, CSRF, refresh và logout. Bộ backend và migration của lần trước không bị sửa trong lần tích hợp này. Vite còn cảnh báo kích thước bundle.

Bằng chứng local: `D:/VSCode/PTUDHTTTHD/.qtkd-tools/customer-api-ui/api-ui-report.json`, `created-api.png`, `customer-api-final.png`.

## Giới hạn còn lại

- Backend SYS-CUS-03 bị gỡ theo yêu cầu. Màn thông báo chưa sẵn sàng ở chế độ API là chủ ý.
- Nguồn xác minh nghiệp vụ thật cho kích hoạt lại chưa nối, nên ca thực tế hiện dừng ở context với nút xác nhận bị khóa. Không báo đã kích hoạt lại thành công từ nguồn thật.
- Các nhóm hợp đồng/bảng giá/thanh toán trong chi tiết khách hàng còn phụ thuộc API nguồn; UI đã gọi và báo đúng trạng thái thiếu nguồn, chưa hiển thị danh sách thật. Lookup khách hàng trong phân hệ hợp đồng đã hoạt động.
- Thiếu liên kết MST trùng của lần 05/11 đã được sửa trong cập nhật 06/11 ở đầu tài liệu.
- Worker chuyển customer outbox tới Notifications chưa có; không báo thông báo đã gửi.
- Hai lỗi mobile của main ghi trong báo cáo giai đoạn trước chưa được sửa ở lần nối API này.

## Chạy để test

Hiện mở `http://localhost:5173/khach-hang`: FE gọi API .NET trên máy, API đọc/ghi **Supabase** theo env đã cung cấp. DB local 55439 đã xóa. API đang chạy tại `http://127.0.0.1:7156`; Vite đang proxy tới địa chỉ đó. Khi khởi động bình thường bằng `backend/Start-Api.ps1`, API dùng profile HTTPS 7156 và Vite mặc định proxy HTTPS; nguồn DB vẫn là Supabase.

Dùng tài khoản Supabase của nhóm, chẳng hạn `demo.sales` với mật khẩu nhận qua kênh riêng. Các tài khoản local `test.customer.*` đã xóa cùng DB, không dùng để đăng nhập nữa. Không đưa mật khẩu/env vào Git.

Để chạy lại script tự động: đặt `QTKD_CUSTOMER_TEST_DISPOSABLE=true`, `QTKD_CUSTOMER_TEST_PORT`, `QTKD_UI_BASE=http://localhost:5173`, `QTKD_PLAYWRIGHT_PACKAGE`, `QTKD_BROWSER_PATH`, `QTKD_UI_ARTIFACTS` rồi chạy `node backend/tests/customer-main-api-ui.mjs`. Script cần baseline migration/seed của main và API local đang hoạt động; không có fallback tới cấu hình DB thật.

Mã test tự động chỉ cho phép DB dùng một lần được chọn rõ ràng; việc giữ script không tạo hoặc giữ DB local. Env và chứng chỉ riêng vẫn được Git bỏ qua. Lần 06/11 chỉ áp migration khách hàng và thử các ca không ghi hồ sơ thành công trên Supabase theo yêu cầu chuyển sang DB thật; không push.
