# Trạng thái triển khai luồng khách hàng

## Quyết định phạm vi đã thống nhất

- Nhân viên Kinh doanh có quyền xem khách hàng thuộc phạm vi phòng Kinh doanh; quyền cập nhật của nhân viên chỉ áp dụng cho khách do chính người đó phụ trách. Trưởng phòng có quyền cập nhật khách trong phạm vi phòng nếu được cấp quyền.
- Quyền thay đổi trạng thái không mặc định cấp cho nhân viên. Identity vẫn cấp quyền theo vai trò; customer có bảng/API ủy quyền riêng cho từng người, chỉ cấp hành động `reactivate`, chỉ áp dụng với khách họ phụ trách, có thời hạn/thu hồi và kiểm tra lại khi ghi. Backend SYS-CUS-03 đã gỡ theo yêu cầu; không cấp mới quyền `suspend`.
- Thiếu nguồn dữ liệu bắt buộc không đồng nghĩa với không có công việc, công nợ hoặc tranh chấp. Chưa có xác minh đáng tin cậy thì không được xác nhận chuyển trạng thái. Nhập số quyết định ngoại lệ không tự chứng minh quyết định đã được phê duyệt.

## Đã có trong nhánh này

- Sau ghép main `65d3092`, API customer dùng Controller → service Application → Repository EF Core trên QtkdDbContext. DTO/validator nằm trong Application, records ở Domain. CRUD, phạm vi, phân trang và lịch sử dùng LINQ; SQL đặc thù khóa/đồng hồ DB nằm trong repository. Service không nhận DbContext/Npgsql/connection string. Tạo/sửa ghi cùng audit/receipt trong một transaction, kiểm tra phiên bản; MST giữ số 0 đầu và duy nhất kể cả Suspended.
- Giao diện API dùng dữ liệu thật cho các chức năng trên. Các nhóm khách hàng/dịch vụ đang là danh mục tạm của Sprint 1, chưa phải danh mục quản trị chung. Văn bản dịch vụ từ dữ liệu cũ được giữ và hiển thị riêng, không tự chuyển sang mã danh mục.
- Khách hàng cũ có thể thiếu người tạo, ngày tạo và lịch sử; giao diện hiển thị chưa rõ thay vì tự đặt giá trị. Migration bổ sung mã mà không tăng phiên bản hồ sơ cũ.
- Khi truy cập hồ sơ liên quan, backend kiểm tra quyền nhóm trước. Nguồn chưa tích hợp trả lỗi thay vì kết luận không có hồ sơ. Trong chế độ API, thao tác tải tệp căn cứ và báo sai lệch chưa được kết nối.
- Backend tạm ngưng không còn endpoint; UI API báo chưa sẵn sàng. Kích hoạt lại có đầy đủ giao dịch trạng thái/quyết định/audit/outbox/receipt, chống gửi lặp và xung đột; ca thành công được kiểm thử với nguồn xác minh có kiểm soát trên DB test. Nguồn xác nhận thật chưa nối nên môi trường Supabase vẫn khóa xác nhận, trả `REVIEW_INCOMPLETE` khi thử ghi. Không coi tên tệp hay lời khai ngoại lệ từ trình duyệt là căn cứ đã duyệt.
- MST trùng trả tham chiếu tối thiểu trong phạm vi để mở hồ sơ có sẵn; ngoài phạm vi chỉ báo trùng. Cảnh báo rời form tạo/sửa đã xử lý menu/Back và tránh hỏi lại sau lưu/Hủy. Bảng khách hàng giữ cột tên khi cửa sổ hẹp bằng cuộn ngang trong thẻ kết quả.

## Còn cần thực hiện trước khi nghiệm thu toàn bộ

1. Thống nhất nguồn có thẩm quyền và cách kiểm tra tính đầy đủ, thời điểm cập nhật của công việc Khai thác, dịch vụ chưa tính phí, công nợ, tranh chấp và hồ sơ liên quan. Tích hợp nguồn và kiểm tra lại tại thời điểm xác nhận; không dùng dữ liệu demo làm bằng chứng.
2. Nối nguồn xác minh thật cho kích hoạt lại theo từng nguyên nhân và chạy lại ca thành công với nguồn này. Chưa có worker chuyển customer outbox sang Notifications. SYS-CUS-03 backend nằm ngoài phạm vi hiện tại.
3. Đồng bộ tài liệu nghiệp vụ về thẩm quyền với cơ chế ủy quyền cá nhân đã triển khai; không coi việc cấp quyền theo vai trò là cấp riêng cho một người.
4. Tích hợp lưu tệp căn cứ thật, danh mục thật và hồ sơ hợp đồng/bảng giá/thanh toán theo quyền riêng. Các phân hệ tạo giao dịch mới phải tự kiểm tra trạng thái khách; hợp đồng và khoản phí đã phát sinh không tự bị hủy hay khôi phục khi đổi trạng thái.
5. Chạy lại các ca thành công và thất bại trên môi trường thử có đủ nguồn, cùng kiểm thử giao diện từ đầu đến cuối. Chưa thể kết luận toàn bộ phần khách hàng đạt chỉ dựa trên các ca đang chạy được.

## Kiểm thử cục bộ

`backend/tests/customer-flow-postgres.mjs` cần `QTKD_CUSTOMER_TEST_DISPOSABLE=true`, `QTKD_CUSTOMER_TEST_PORT` và DB `qtkdtest` dùng một lần đã migrate/seed. `QTKD_CUSTOMER_TEST_API` chọn HTTP API loopback (mặc định 7156); lần kiểm chứng dùng riêng 7157. Script tạo dữ liệu tổng hợp và kiểm tra đúng DB trước khi ghi. Không fallback sang Supabase.

`backend/tests/customer-main-api-ui.mjs` kiểm tra UI → API → PostgreSQL dùng một lần. Bộ customer hiện có 21 unit, 7 integration, 1 test adapter frontend và 19 kịch bản browser; script business riêng không được cộng như một bộ ca độc lập để tránh đếm trùng. Kết quả, giới hạn và so sánh lỗi có sẵn trên main ở [báo cáo](../../testing/test-cases/customers-api-ui.md). DB test trong bộ nhớ được xóa sau khi chạy; ứng dụng bàn giao vẫn nối Supabase.
