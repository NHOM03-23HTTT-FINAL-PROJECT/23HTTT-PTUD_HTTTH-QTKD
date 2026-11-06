# API Khách hàng

Cập nhật trên `cus-flow` ngày 06/11/2026, sau khi ghép `main` tại `65d3092`. Tiền tố: `/api/v1`. Các thao tác ghi dùng JWT, CSRF chung của backend; tạo/sửa/tạm ngưng/kích hoạt lại cần `Idempotency-Key`. Kết quả thực chạy và test case ở [báo cáo kiểm thử](../../testing/test-cases/customer-suspension.md).

Theo yêu cầu mới ngày 06/11/2026, **backend SYS-CUS-03 đã được bổ sung lại**, thay thế trạng thái đã gỡ ở commit `42445dd`. Tạm ngưng và kích hoạt lại có quyền riêng theo từng người; backend kiểm tra hồ sơ phụ trách và hiệu lực ủy quyền. [Kết quả kiểm thử và phụ thuộc thực tế](../../testing/test-cases/customer-suspension.md).

Frontend đã nối API thật cho danh sách, tạo, sửa, chi tiết, quyền thao tác, tạm ngưng và kích hoạt lại; giữ bố cục/component của main. Chế độ `VITE_AUTH_MODE=api` gọi HTTP có JWT/CSRF, không gửi actor do client tự chọn và không fallback sang mock khi API lỗi. Chỉ chế độ `mock` mới dùng prototype.

Trưởng phòng mở **Ủy quyền trạng thái** từ danh sách khách hàng, chọn tạm ngưng hoặc kích hoạt lại để cấp/thu hồi quyền cá nhân. Các nguồn chưa tích hợp được ghi rõ là phụ thuộc; không dùng dữ liệu prototype làm kết quả xác minh trong chế độ API.

| Method | Endpoint | SYS | Hành vi backend |
|---|---|---|---|
| GET | `/customers?keyword&status&sort&page&size` | CUS-05 | Chỉ đếm/trả khách thuộc phòng Kinh doanh của actor. Mặc định Active, trang 1, 8 dòng; hỗ trợ 8/20/50 dòng. |
| GET | `/customers/{code}` | CUS-06 | Thông tin, lịch sử tạo/sửa, quyết định trạng thái; ngoài phạm vi trả 404. |
| GET | `/customers/form-options` | CUS-01/02 | Danh mục tạm của Sprint 1; chưa nối phân hệ danh mục dùng chung. |
| POST | `/customers` | CUS-01 | `{draft}`; chủ hồ sơ, mã và trạng thái do server gán. MST duy nhất toàn hệ thống, kể cả Suspended. |
| PATCH | `/customers/{code}` | CUS-02 | `{baseVersion,draft,reason}`; nhân viên sửa khách mình phụ trách, trưởng phòng sửa khách trong phòng. Trường hệ thống/MST không được sửa. |
| GET | `/customers/{code}/status-permissions` | CUS-03/04 | `{canSuspend,canReactivate}`; kiểm tra từng người, từng hành động và khách đang phụ trách. |
| GET | `/customers/delegations/candidates` | CUS-04 | Nhân viên Kinh doanh Active cùng phòng; chỉ trưởng phòng quản lý. |
| GET | `/customers/delegations` | CUS-04 | Lịch sử cấp/thu hồi/hết hạn/không đủ điều kiện. |
| POST | `/customers/delegations` | CUS-03/04 | `{granteeId,action:"suspend"\|"reactivate",expiresAt?,reason?}`. Hai quyền độc lập; không tự cấp quyền còn lại. |
| POST | `/customers/delegations/{id}/revoke` | CUS-04 | Thu hồi quyền, giữ lịch sử; retry không ghi thêm audit thu hồi. |
| GET | `/customers/{code}/reactivation-context` | CUS-04 | Quyết định tạm ngưng trước và điều kiện xác minh; nguồn chưa đầy đủ thì `canReactivate:false`. |
| POST | `/customers/{code}/reactivate` | CUS-04 | `{baseVersion,reason,evidence,exception?}`; kiểm tra nguồn server, quyền, phiên bản, lưu trạng thái/quyết định/audit/outbox/receipt trong cùng transaction. |
| GET | `/customers/suspension-reason-groups` | CUS-03 | Danh sách nhóm lý do hợp lệ do backend quy định. |
| GET | `/customers/{code}/suspension-review` | CUS-03 | `{items,failedKinds,missingSources,reviewToken,notificationDepartments,failedAt}`. Hợp đồng/lượt duyệt lấy từ DB; nguồn thiếu không trả như 0. Hồ sơ ngoài quyền không lộ mã/nội dung. |
| POST | `/customers/{code}/suspend` | CUS-03 | `{baseVersion,reasonGroup,reason,evidence,plan:[{id,option}],coordinationNote,reviewToken}`. Rà soát lại, so token, kiểm tra đủ phương án/căn cứ; ghi nguyên tử, giữ nguyên hồ sơ liên quan. |
| GET | `/customers/{code}/records/{group}` | CUS-06 | `contracts/priceLists/payments` còn trả lỗi nguồn chưa tích hợp; kiểm tra phạm vi trước, quyền phân hệ cho contracts/payments. |

Báo cáo sai lệch thanh toán và tải tệp căn cứ chưa được tích hợp. Các nhóm hồ sơ ngoài customer giữ nguyên phạm vi hiện tại.

MST trùng trả `409 DUPLICATE_TAX_CODE`, với `detail.existing` là `{code,name,taxCode,status}` khi hồ sơ thuộc phạm vi được xem, hoặc `null` khi ngoài phạm vi. FE chỉ mở hồ sơ khi có mã do server trả về. Lỗi này không ghi thêm operation/audit.

## Quyền và xác minh

Nhân viên xem khách trong phòng Kinh doanh nhưng chỉ sửa khách mình phụ trách. Trưởng phòng có `customers.change-status` và `customers.view` được đổi trạng thái trong phạm vi phòng, hoặc cấp riêng từng quyền cho nhân viên Active cùng phòng, trên khách đang được nhân viên đó phụ trách. Quyền theo vai trò của nhân viên không thay cho ủy quyền cá nhân. Kiểm tra lại hiệu lực ngay trước khi ghi; hết hạn/thu hồi không bị bỏ qua bởi retry.

Nguồn thật hiện chưa có xác nhận có thẩm quyền: kích hoạt lại trả `REVIEW_INCOMPLETE`, giữ nguyên dữ liệu. Tệp chỉ có tên/kích thước không được coi là bằng chứng đã lưu; gửi tệp như vậy trả `EVIDENCE_UNAVAILABLE`. Không tự tin lời khai ngoại lệ từ trình duyệt. Các ca thành công trong test dùng nguồn kiểm soát riêng, không thay nguồn thật trong ứng dụng.

MST trùng đã trả tham chiếu hồ sơ trong phạm vi cho nhánh A5.3 của SYS-CUS-01. Outbox mới lưu yêu cầu, chưa có worker chuyển tới hộp Notifications.

## Lưu trữ

Nguồn schema duy nhất là EF Core `QtkdDbContext`, áp qua `QTKD.DbTool` theo [DB/README](../../../DB/README.md). Runtime customer hiện theo Controller → service Application → `ICustomerRepository`/`CustomerRepository` EF Core. SQL đặc thù khóa/đồng hồ PostgreSQL nằm trong repository; không tạo kết nối DB riêng trong service. Migration `20261105104547_CustomerFlow` bổ sung dữ liệu luồng; `20261106095056_CustomerEfRepositoryAlignment` chỉ đồng bộ metadata sau ghép main, không có DDL trong Up/Down. API không tự migrate.
