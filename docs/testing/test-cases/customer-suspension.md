# Kiểm thử backend tạm ngưng khách hàng — 06/11/2026

Phạm vi: bổ sung lại SYS-CUS-03 / US-CUS-04 sau yêu cầu mới, trên nền `cus-flow` đã ghép main `65d3092` tại `42445dd`. Trước khi cập nhật PR #33, đã ghép tiếp main `e9deffe` (Audit) và chạy lại các bộ kiểm tra bên dưới. Không sửa nghiệp vụ phân hệ khác; chỉ nối lại form customer hiện có và sửa lỗi hiển thị tại đó.

## Kiểm tra ghép main trước khi push

Có một xung đột nội dung trong `backend/src/QTKD.Api/Program.cs`: hai nhánh cùng thêm đăng ký service sau Notifications. Đã giữ cả `ICustomerStatusSource`/`CustomerService` của customer và `AuditLogService` của main. Router, persistence và tài liệu ghép tự động; phần Audit không có thay đổi so với main. Main `e9deffe` là tổ tiên của nhánh sau merge; không còn file unmerged hoặc dấu conflict.

Không thêm migration khi bổ sung lại SYS-CUS-03 hoặc khi ghép Audit. Migration/seed cho lượt kiểm thử chỉ chạy trên PostgreSQL dùng một lần ở cổng 55441; không chạy trên Supabase. Đã dừng API/UI thử và xóa container sau kiểm thử; ứng dụng chính 5173/7156 tiếp tục dùng cấu hình Supabase đã có.

## Nghiệp vụ và phần đã thực hiện

- Trưởng phòng có quyền đổi trạng thái trong phòng; nhân viên phải được giao riêng hành động `suspend`, trên khách đang phụ trách. Quyền `reactivate` không cấp kèm. Kiểm tra hiệu lực khi mở và ngay trước khi ghi; thu hồi/hết hạn không bị bỏ qua bởi retry.
- Bắt buộc lý do hợp lệ, phiên bản hiện tại, kết quả rà soát đủ nguồn và còn mới. Token rà soát bao gồm phiên bản khách và fingerprint nguồn. Mục ảnh hưởng mới/thay đổi bắt buộc tải lại, chọn lại phương án và xác nhận lại.
- Có hợp đồng Active/Approved hoặc lượt duyệt Running không tự chặn quyết định khi đã đủ rà soát/phương án. Mỗi mục phải có lựa chọn từ danh sách backend; khi có ảnh hưởng cần ghi căn cứ phối hợp. Không đổi trạng thái hợp đồng/lượt duyệt, không hủy công nợ đã phát sinh.
- Trạng thái, quyết định, phương án, audit, receipt và outbox khi có cấu hình cùng một transaction. Gửi lại cùng yêu cầu không ghi thêm lịch sử; hai yêu cầu đồng thời chỉ một yêu cầu chuyển trạng thái. Lỗi lưu outbox bắt buộc làm rollback cả lần ghi. Lỗi gửi sau commit thuộc worker, không được hoàn tác quyết định.
- Không có cấu hình thông báo áp dụng thì không ghi outbox, theo SYS-CUS-03 A9. Cấu hình server tùy chọn: `Customers:SuspensionNotifications:Departments`, giá trị trong Kinh doanh/Khai thác/Kế toán/Pháp chế; mặc định không có. Chưa có worker chuyển outbox vào Notifications.
- Tên/kích thước tệp do trình duyệt gửi không phải bằng chứng đã lưu: trả `EVIDENCE_UNAVAILABLE`. UI API không cung cấp ô tải tệp giả; cho ghi số văn bản/nội dung phối hợp.

Luồng đi theo `CustomersController` → service Application → `ICustomerRepository` / Repository EF Core trên cùng QtkdDbContext. Rà soát đọc thật hợp đồng và lượt duyệt hợp đồng; quyền xem theo phạm vi hợp đồng của main: nhân viên chỉ xem hợp đồng mình phụ trách, trưởng phòng cần được gán quản lý phòng tương ứng. Tài khoản chỉ mang vai trò SalesManager chưa đủ để đọc chi tiết hợp đồng. Khóa PostgreSQL chỉ nằm trong repository. Không dùng NpgsqlConnection trong service, không sửa schema và không thêm migration.

## Giới hạn nguồn thật, không đánh dấu hoàn thành toàn bộ

Nguồn công việc Khai thác (`operations_jobs`) và dịch vụ chưa tính phí (`unbilled_services`) chưa hoàn chỉnh. Khi có lượt duyệt bảng thanh toán, phần rà soát đó cũng được báo phụ thuộc (`payment_approval_review`). Hồ sơ hợp đồng ngoài quyền xem không lộ mã/tên và không coi là không tồn tại (`restricted_contracts` / `restricted_approvals`).

Vì SYS-CUS-03 E2 yêu cầu không xác nhận từ kết quả chưa đầy đủ, **xác nhận tạm ngưng trên Supabase hiện vẫn bị chặn**. Đây là giới hạn tích hợp thật còn lại; ca chuyển trạng thái thành công dùng nguồn có kiểm soát được thay thế qua DI chỉ trong WebApplicationFactory test, không có cờ bỏ qua kiểm tra trong API ứng dụng. Nguồn xác nhận kích hoạt lại thật cũng chưa nối, giữ nguyên giới hạn trước đó. Không thể kết luận toàn bộ nghiệp vụ hai chiều đạt trên Supabase.

## Kết quả chạy

| Bộ kiểm tra | Kết quả |
|---|---|
| Customer unit: validator và service | 21/21 PASS |
| Customer integration: 9 PostgreSQL + 3 SQLite repository | 12/12 PASS |
| Customer adapter frontend: MST trùng và request tạm ngưng | 2/2 PASS, nằm trong frontend 36/36 PASS sau ghép main |
| UI → API → PostgreSQL | 20/20 PASS |
| Script business API/SQL customer | PASS |
| Build backend / frontend | PASS, còn cảnh báo có sẵn của repo và bundle lớn |
| Toàn bộ unit backend | 100/100 PASS sau ghép main; 21 unit customer nằm trong số này |

Tổng riêng customer **55 mục tự động**; không cộng script business hoặc CUA như bộ ca mới vì có kiểm tra trùng. Kết quả 25 integration failure ngoài customer thuộc lần đối chiếu main `65d3092` trong báo cáo lịch sử; lượt ghép `e9deffe` này không chạy lại toàn bộ integration ngoài customer và không tuyên bố chúng đã được sửa.

Bằng chứng chạy lại sau ghép `e9deffe` ở workspace cha, ngoài Git: `.qtkd-tools/customer-publish-20261106/`, gồm `customer-after-main_*.trx`, `all-unit-after-main_*.trx`, `build-backend.log`, `build-frontend.log`, `test-frontend.log`, `business-after-main.log`, `ui-after-main/api-ui-report.json` và `cleanup.json`.

## Test case tạm ngưng được chạy

| Ca / nhánh spec | Kết quả quan sát |
|---|---|
| Quyền/phạm vi, E1 | Nhân viên chưa nhận quyền bị 403; nhận `suspend` chỉ vào khách mình phụ trách; hồ sơ đồng nghiệp vẫn bị chặn; `reactivate` không tự bật |
| A2/A3, CSRF và payload | Chặn đã Suspended, lý do trống, nhóm lý do giả, phiên bản sai, thiếu key, thiếu CSRF, trường actor tự gửi và plan chứa null |
| E2 | Review trả riêng nguồn thiếu, POST 503 `REVIEW_INCOMPLETE`, không ghi quyết định/audit/receipt hoặc đổi trạng thái |
| A7 | Fingerprint thay đổi sau khi mở review trả 409 `REVIEW_CHANGED`; không dùng dữ liệu cũ để ghi |
| A4.1–A4.3 | Chặn thiếu mục, mục lạ, mục lặp, phương án không hợp lệ và thiếu ghi chú phối hợp; đủ thông tin lưu được kế hoạch |
| B8/E3 | Ép outbox lỗi sau cập nhật trạng thái/quyết định/audit: tất cả rollback, phiên bản và trạng thái giữ nguyên |
| A2/E4 | Gửi hai yêu cầu đồng thời: 1 thành công, 1 xung đột; retry key thắng trả replay; không nhân đôi quyết định/audit/outbox |
| A9 | Nguồn thử không có cấu hình thông báo: chuyển trạng thái thành công và không thêm outbox |
| Quyền thay đổi giữa lúc xử lý | Quyền hết hạn trong lúc chờ nguồn rà soát: 403; thu hồi rồi replay key thành công trước đó vẫn bị 403 |
| Nguồn PostgreSQL thực | Đọc đúng hợp đồng Approved/Active và lượt Running; thay trạng thái hợp đồng làm token thay đổi; nhân viên không thấy hợp đồng ngoài quyền; SalesManager chưa được gán quản lý phòng không đọc được chi tiết hợp đồng |
| UI route cá nhân | Cấp/thu hồi qua UI; menu mở được; chỉ route hồ sơ phụ trách mở được; sau thu hồi route bị chặn |
| UI layout | Bảng có chiều cao thực, tiêu đề nằm trong thẻ ở 1440 và 910 px; dữ liệu hợp đồng vẫn hiển thị khi nguồn khác thiếu |

## Computer use trên ứng dụng nối Supabase

Đã đăng nhập `demo.sales` và `demo.sales.manager`, mở menu “Thao tác khác”, vào form, thử lý do trống, rà soát, chọn phương án, nhập ghi chú và tải lại. Lựa chọn/ghi chú được giữ; nút xác nhận vẫn khóa khi thiếu nguồn. Review KH-000001 hiển thị 1 hợp đồng và 6 lượt duyệt thật. Không xác nhận thay đổi trạng thái hoặc cấp quyền trên DB chung.

Phát hiện và sửa lỗi `.customer-card` có `flex:1` kết hợp `overflow:hidden` làm thẻ bảng rà soát co gần về 0 dù DOM có dữ liệu. Đặt thẻ không co, thêm cuộn ngang và điều chỉnh thẻ thống kê khi cửa sổ hẹp. Đã thêm assertion hình học để tránh bỏ sót lỗi bằng kiểm tra DOM đơn thuần. Chế độ API yêu cầu người dùng chọn phương án, không mặc định xác nhận lựa chọn đầu tiên.

Kiểm tra DB chỉ đọc sau thao tác: Supabase vẫn 10 khách (8 Active, 2 Suspended), 2 quyết định, 46 audit; fingerprint khách/quyết định trùng lần trước. Profile/operation/outbox/delegation đều 0 dòng. Không migrate/seed Supabase trong lần bổ sung này.

Bằng chứng cục bộ ngoài Git tại `.qtkd-tools/customer-suspend-20261106` của workspace cha: TRX `customer-scope-final_*` và `all-unit-verified_*`, `business.log`, `ui-final/api-ui-report.json`, ảnh `ui-final/suspension-real-review.png`, `ui-final/suspension-narrow-review.png`, `cua-staff-denied.jpg`, `cua-supabase-review-fixed.jpg`, snapshot `supabase-after-suspension-ui.json`. Các ảnh và log không chứa mật khẩu/token.

DB dùng một lần chạy trong tmpfs, tách cổng API/UI 7157/5174. Sau lượt kiểm thử cuối đã dừng/xóa DB và hai tiến trình này: không còn container thử, không có volume bền vững, cổng 55441/7157/5174 đóng (xem `cleanup.json`). Ứng dụng bàn giao tại 5173/7156 vẫn chạy với cấu hình Supabase, không có fallback sang DB thử.
