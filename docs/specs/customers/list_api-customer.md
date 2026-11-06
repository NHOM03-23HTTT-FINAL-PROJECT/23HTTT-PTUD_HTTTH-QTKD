# API Khách hàng

Cập nhật trên `cus-flow` ngày 06/11/2026, sau khi ghép `main` tại `65d3092`. Tiền tố: `/api/v1`. Các thao tác ghi dùng JWT, CSRF chung của backend; tạo/sửa/kích hoạt lại cần `Idempotency-Key`. Kết quả thực chạy và test case ở [báo cáo kiểm thử](../../testing/test-cases/customers-api-ui.md).

Theo yêu cầu của người dùng, **backend SYS-CUS-03 đã được gỡ**: không còn endpoint rà soát/tạm ngưng, không cấp mới ủy quyền `suspend`. `canSuspend` luôn bằng `false`. Lịch sử Suspend và trạng thái Suspended có sẵn vẫn được đọc để phục vụ SYS-CUS-04; không xóa dữ liệu lịch sử.

Frontend đã nối API thật cho danh sách, tạo, sửa, chi tiết, quyền thao tác và kích hoạt lại; giữ bố cục/component của main. Chế độ `VITE_AUTH_MODE=api` gọi HTTP có JWT/CSRF, không gửi actor do client tự chọn và không fallback sang mock khi API lỗi. Chỉ chế độ `mock` mới dùng prototype.

Trưởng phòng mở **Ủy quyền kích hoạt lại** từ danh sách khách hàng để cấp/thu hồi quyền cá nhân qua API. Không có lựa chọn cấp quyền tạm ngưng mới. Các nhóm hồ sơ chưa nối nguồn hiển thị phụ thuộc; kích hoạt lại chỉ cho xác nhận khi nguồn server đã xác minh. Xem [kiểm thử UI/API/PostgreSQL](../../testing/test-cases/customers-api-ui.md).

| Method | Endpoint | SYS | Hành vi backend |
|---|---|---|---|
| GET | `/customers?keyword&status&sort&page&size` | CUS-05 | Chỉ đếm/trả khách thuộc phòng Kinh doanh của actor. Mặc định Active, trang 1, 8 dòng; hỗ trợ 8/20/50 dòng. |
| GET | `/customers/{code}` | CUS-06 | Thông tin, lịch sử tạo/sửa, quyết định trạng thái; ngoài phạm vi trả 404. |
| GET | `/customers/form-options` | CUS-01/02 | Danh mục tạm của Sprint 1; chưa nối phân hệ danh mục dùng chung. |
| POST | `/customers` | CUS-01 | `{draft}`; chủ hồ sơ, mã và trạng thái do server gán. MST duy nhất toàn hệ thống, kể cả Suspended. |
| PATCH | `/customers/{code}` | CUS-02 | `{baseVersion,draft,reason}`; nhân viên sửa khách mình phụ trách, trưởng phòng sửa khách trong phòng. Trường hệ thống/MST không được sửa. |
| GET | `/customers/{code}/status-permissions` | CUS-04 | `{canSuspend:false,canReactivate}`; kiểm tra từng người và khách đang phụ trách. |
| GET | `/customers/delegations/candidates` | CUS-04 | Nhân viên Kinh doanh Active cùng phòng; chỉ trưởng phòng quản lý. |
| GET | `/customers/delegations` | CUS-04 | Lịch sử cấp/thu hồi/hết hạn/không đủ điều kiện. |
| POST | `/customers/delegations` | CUS-04 | `{granteeId,action:"reactivate",expiresAt?,reason?}`. Action `suspend` trả 400. |
| POST | `/customers/delegations/{id}/revoke` | CUS-04 | Thu hồi quyền, giữ lịch sử; retry không ghi thêm audit thu hồi. |
| GET | `/customers/{code}/reactivation-context` | CUS-04 | Quyết định tạm ngưng trước và điều kiện xác minh; nguồn chưa đầy đủ thì `canReactivate:false`. |
| POST | `/customers/{code}/reactivate` | CUS-04 | `{baseVersion,reason,evidence,exception?}`; kiểm tra nguồn server, quyền, phiên bản, lưu trạng thái/quyết định/audit/outbox/receipt trong cùng transaction. |
| GET | `/customers/{code}/records/{group}` | CUS-06 | `contracts/priceLists/payments` còn trả lỗi nguồn chưa tích hợp; kiểm tra phạm vi trước, quyền phân hệ cho contracts/payments. |

Các endpoint `/suspension-review`, `/suspend`, `/suspension-reason-groups` và báo cáo sai lệch thanh toán không được triển khai trong bản backend này.

MST trùng trả `409 DUPLICATE_TAX_CODE`, với `detail.existing` là `{code,name,taxCode,status}` khi hồ sơ thuộc phạm vi được xem, hoặc `null` khi ngoài phạm vi. FE chỉ mở hồ sơ khi có mã do server trả về. Lỗi này không ghi thêm operation/audit.

## Quyền và xác minh

Nhân viên xem khách trong phòng Kinh doanh nhưng chỉ sửa khách mình phụ trách. Trưởng phòng có `customers.change-status` và `customers.view` được kích hoạt lại trong phạm vi phòng, hoặc cấp riêng quyền kích hoạt lại cho nhân viên Active cùng phòng, trên khách đang được nhân viên đó phụ trách. Quyền theo vai trò của nhân viên không thay cho ủy quyền cá nhân. Kiểm tra lại hiệu lực ngay trước khi ghi; hết hạn/thu hồi không bị bỏ qua bởi retry.

Nguồn thật hiện chưa có xác nhận có thẩm quyền: kích hoạt lại trả `REVIEW_INCOMPLETE`, giữ nguyên dữ liệu. Tệp chỉ có tên/kích thước không được coi là bằng chứng đã lưu; gửi tệp như vậy trả `EVIDENCE_UNAVAILABLE`. Không tự tin lời khai ngoại lệ từ trình duyệt. Các ca thành công trong test dùng nguồn kiểm soát riêng, không thay nguồn thật trong ứng dụng.

MST trùng đã trả tham chiếu hồ sơ trong phạm vi cho nhánh A5.3 của SYS-CUS-01. Outbox mới lưu yêu cầu, chưa có worker chuyển tới hộp Notifications.

## Lưu trữ

Nguồn schema duy nhất là EF Core `QtkdDbContext`, áp qua `QTKD.DbTool` theo [DB/README](../../../DB/README.md). Runtime customer hiện theo Controller → service Application → `ICustomerRepository`/`CustomerRepository` EF Core. SQL đặc thù khóa/đồng hồ PostgreSQL nằm trong repository; không tạo kết nối DB riêng trong service. Migration `20261105104547_CustomerFlow` bổ sung dữ liệu luồng; `20261106095056_CustomerEfRepositoryAlignment` chỉ đồng bộ metadata sau ghép main, không có DDL trong Up/Down. API không tự migrate.
