# Trạng thái triển khai luồng khách hàng

## Quyết định phạm vi đã thống nhất

- Nhân viên Kinh doanh có quyền xem khách hàng thuộc phạm vi phòng Kinh doanh; quyền cập nhật của nhân viên chỉ áp dụng cho khách do chính người đó phụ trách. Trưởng phòng có quyền cập nhật khách trong phạm vi phòng nếu được cấp quyền.
- Quyền thay đổi trạng thái không mặc định cấp cho nhân viên. Customer có bảng/API ủy quyền riêng cho từng người, tách `suspend` và `reactivate`, chỉ áp dụng với khách họ phụ trách, có thời hạn/thu hồi và kiểm tra lại khi ghi. Trưởng phòng có `customers.change-status` xử lý khách trong phòng. Theo yêu cầu mới ngày 06/11/2026, SYS-CUS-03 backend được bổ sung lại.
- Thiếu nguồn dữ liệu bắt buộc không đồng nghĩa với không có công việc, công nợ hoặc tranh chấp. Chưa có xác minh đáng tin cậy thì không được xác nhận chuyển trạng thái. Nhập số quyết định ngoại lệ không tự chứng minh quyết định đã được phê duyệt.

## Đã có trong nhánh này

- Sau ghép main `e9deffe`, API customer dùng Controller → service Application → Repository EF Core trên QtkdDbContext; giữ đăng ký Audit mới của main. DTO/validator nằm trong Application, records ở Domain. CRUD, phạm vi, phân trang và lịch sử dùng LINQ; SQL đặc thù khóa/đồng hồ DB nằm trong repository. Service không nhận DbContext/Npgsql/connection string. Tạo/sửa ghi cùng audit/receipt trong một transaction, kiểm tra phiên bản; MST giữ số 0 đầu và duy nhất kể cả Suspended.
- Giao diện API dùng dữ liệu thật cho các chức năng trên. Các nhóm khách hàng/dịch vụ đang là danh mục tạm của Sprint 1, chưa phải danh mục quản trị chung. Văn bản dịch vụ từ dữ liệu cũ được giữ và hiển thị riêng, không tự chuyển sang mã danh mục.
- Khách hàng cũ có thể thiếu người tạo, ngày tạo và lịch sử; giao diện hiển thị chưa rõ thay vì tự đặt giá trị. Migration bổ sung mã mà không tăng phiên bản hồ sơ cũ.
- Khi truy cập hồ sơ liên quan, backend kiểm tra quyền nhóm trước. Nguồn chưa tích hợp trả lỗi thay vì kết luận không có hồ sơ. Trong chế độ API, thao tác tải tệp căn cứ và báo sai lệch chưa được kết nối.
- Backend tạm ngưng có endpoint nhóm lý do, rà soát và xác nhận. Service kiểm tra quyền cá nhân/phạm vi, lý do, phiên bản, token kết quả rà soát mới, từng phương án và ghi chú phối hợp; trạng thái/quyết định/audit/receipt và outbox khi có cấu hình cùng transaction. Hợp đồng Active/Approved và lượt duyệt hợp đồng Running được đọc bằng Repository EF Core theo quyền xem hợp đồng. Nguồn công việc Khai thác/dịch vụ chưa tính phí còn thiếu, không giả thành 0; xác nhận trên Supabase vẫn trả `REVIEW_INCOMPLETE` theo SYS-CUS-03 E2. Không có cấu hình thông báo thì không ghi outbox (A9).
- Kích hoạt lại giữ giao dịch trạng thái/quyết định/audit/outbox/receipt, chống gửi lặp và xung đột; bổ sung kiểm tra phiên còn hiệu lực sau xác minh. Ca thành công hai chiều được kiểm thử với nguồn có kiểm soát trên DB thử. Nguồn xác nhận kích hoạt lại thật vẫn chưa nối. Không coi tên tệp hay lời khai ngoại lệ từ trình duyệt là căn cứ đã duyệt.
- Form tạm ngưng hiện có đã nối API, route cho phép kiểm tra ủy quyền cá nhân. Sửa lỗi thẻ bảng ảnh hưởng bị co gần về 0; bảng giữ chiều cao nội dung, cuộn ngang, thẻ thống kê xếp 2 cột khi cửa sổ hẹp. Chế độ API yêu cầu tự chọn phương án; nút xác nhận bị khóa thể hiện mờ. Giữ bố cục main.
- MST trùng trả tham chiếu tối thiểu trong phạm vi để mở hồ sơ có sẵn; ngoài phạm vi chỉ báo trùng. Cảnh báo rời form tạo/sửa đã xử lý menu/Back và tránh hỏi lại sau lưu/Hủy. Bảng khách hàng giữ cột tên khi cửa sổ hẹp bằng cuộn ngang trong thẻ kết quả.

## Còn cần thực hiện trước khi nghiệm thu toàn bộ

1. Thống nhất nguồn có thẩm quyền và cách kiểm tra tính đầy đủ, thời điểm cập nhật của công việc Khai thác, dịch vụ chưa tính phí, công nợ, tranh chấp và hồ sơ liên quan. Tích hợp nguồn và kiểm tra lại tại thời điểm xác nhận; không dùng dữ liệu demo làm bằng chứng.
2. Nối các nguồn còn thiếu cho rà soát tạm ngưng và xác nhận kích hoạt lại, bảo vệ độ mới đến cuối transaction rồi chạy lại ca thành công với nguồn thật. Chưa có worker chuyển customer outbox sang Notifications.
3. Đồng bộ tài liệu nghiệp vụ về thẩm quyền với cơ chế ủy quyền cá nhân đã triển khai; không coi việc cấp quyền theo vai trò là cấp riêng cho một người.
4. Tích hợp lưu tệp căn cứ thật, danh mục thật và hồ sơ hợp đồng/bảng giá/thanh toán theo quyền riêng. Các phân hệ tạo giao dịch mới phải tự kiểm tra trạng thái khách; hợp đồng và khoản phí đã phát sinh không tự bị hủy hay khôi phục khi đổi trạng thái.
5. Chạy lại các ca thành công và thất bại trên môi trường thử có đủ nguồn, cùng kiểm thử giao diện từ đầu đến cuối. Chưa thể kết luận toàn bộ phần khách hàng đạt chỉ dựa trên các ca đang chạy được.

## Kiểm thử cục bộ

`backend/tests/customer-flow-postgres.mjs` cần `QTKD_CUSTOMER_TEST_DISPOSABLE=true`, `QTKD_CUSTOMER_TEST_PORT` và DB `qtkdtest` dùng một lần đã migrate/seed. `QTKD_CUSTOMER_TEST_API` chọn HTTP API loopback (mặc định 7156); lần kiểm chứng dùng riêng 7157. Script tạo dữ liệu tổng hợp và kiểm tra đúng DB trước khi ghi. Không fallback sang Supabase.

`backend/tests/customer-main-api-ui.mjs` kiểm tra UI → API → PostgreSQL dùng một lần. Sau bổ sung SYS-CUS-03: 21 unit, 12 integration, 2 adapter frontend và 20 kịch bản browser, tổng 55 mục tự động; script business không cộng thêm để tránh đếm trùng. [Báo cáo SYS-CUS-03](../../testing/test-cases/customer-suspension.md) ghi ca thành công, lỗi, giới hạn và bằng chứng UI. [Báo cáo trước đó](../../testing/test-cases/customers-api-ui.md) giữ kết quả đối chiếu lỗi trên main. DB thử chỉ tồn tại trong bộ nhớ khi kiểm thử; ứng dụng bàn giao vẫn nối Supabase.
