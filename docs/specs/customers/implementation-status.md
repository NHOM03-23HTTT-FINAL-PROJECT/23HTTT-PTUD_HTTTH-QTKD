# Trạng thái triển khai luồng khách hàng

## Quyết định phạm vi đã thống nhất

- Nhân viên Kinh doanh có quyền xem khách hàng thuộc phạm vi phòng Kinh doanh; quyền cập nhật của nhân viên chỉ áp dụng cho khách do chính người đó phụ trách. Trưởng phòng có quyền cập nhật khách trong phạm vi phòng nếu được cấp quyền.
- Quyền thay đổi trạng thái là quyền nghiệp vụ, không mặc định cấp cho nhân viên. Hiện Identity cấp quyền theo **vai trò**, chưa hỗ trợ ủy quyền riêng từng người hoặc tách quyền tạm ngưng khỏi quyền kích hoạt lại. Cấp `customers.change-status` cho vai trò nhân viên sẽ ảnh hưởng tất cả người thuộc vai trò đó; không coi đây là ủy quyền cá nhân.
- Thiếu nguồn dữ liệu bắt buộc không đồng nghĩa với không có công việc, công nợ hoặc tranh chấp. Chưa có xác minh đáng tin cậy thì không được xác nhận chuyển trạng thái. Nhập số quyết định ngoại lệ không tự chứng minh quyết định đã được phê duyệt.

## Đã có trong nhánh này

- API tạo, sửa, tra cứu và xem hồ sơ dùng PostgreSQL; kiểm tra quyền và phạm vi ở backend. Mã khách hàng được cấp ổn định, mã số thuế giữ nguyên số 0 đầu và duy nhất cả khi khách tạm ngưng. Yêu cầu tạo/sửa được ghi cùng lịch sử và kết quả xử lý lại trong một giao dịch; cập nhật kiểm tra phiên bản.
- Giao diện API dùng dữ liệu thật cho các chức năng trên. Các nhóm khách hàng/dịch vụ đang là danh mục tạm của Sprint 1, chưa phải danh mục quản trị chung. Văn bản dịch vụ từ dữ liệu cũ được giữ và hiển thị riêng, không tự chuyển sang mã danh mục.
- Khách hàng cũ có thể thiếu người tạo, ngày tạo và lịch sử; giao diện hiển thị chưa rõ thay vì tự đặt giá trị. Migration bổ sung mã mà không tăng phiên bản hồ sơ cũ.
- Khi truy cập hồ sơ liên quan, backend kiểm tra quyền nhóm trước. Nguồn chưa tích hợp trả lỗi thay vì kết luận không có hồ sơ. Trong chế độ API, thao tác tải tệp căn cứ và báo sai lệch chưa được kết nối.
- Các endpoint tạm ngưng, kích hoạt lại và tải ngữ cảnh hiện **chưa thực hiện chuyển trạng thái**: sau khi kiểm tra quyền và phạm vi, chúng trả `503 REVIEW_INCOMPLETE`. Giao diện khóa xác nhận và cho biết dữ liệu chưa xác minh được. Đây là trạng thái chưa hoàn thành, không phải ca chuyển trạng thái thành công.

## Còn cần thực hiện trước khi nghiệm thu toàn bộ

1. Thống nhất nguồn có thẩm quyền và cách kiểm tra tính đầy đủ, thời điểm cập nhật của công việc Khai thác, dịch vụ chưa tính phí, công nợ, tranh chấp và hồ sơ liên quan. Tích hợp nguồn và kiểm tra lại tại thời điểm xác nhận; không dùng dữ liệu demo làm bằng chứng.
2. Cài đặt và kiểm thử giao dịch tạm ngưng/kích hoạt lại: điều kiện theo từng nguyên nhân, kiểm tra quyết định ngoại lệ hợp lệ, phiên bản và thay đổi đồng thời, lưu quyết định/phương án/lịch sử và chống ghi trùng. Kiểm tra việc gửi thông báo hoặc lưu chờ gửi lại; chưa có bộ gửi thông báo cho luồng này.
3. Hoàn thiện ủy quyền theo từng người và quyết định có tách quyền tạm ngưng/kích hoạt lại hay không; cập nhật tài liệu đặc tả hệ thống, user story và quản trị quyền thống nhất với quyết định nghiệp vụ được phê duyệt.
4. Tích hợp lưu tệp căn cứ thật, danh mục thật và hồ sơ hợp đồng/bảng giá/thanh toán theo quyền riêng. Các phân hệ tạo giao dịch mới phải tự kiểm tra trạng thái khách; hợp đồng và khoản phí đã phát sinh không tự bị hủy hay khôi phục khi đổi trạng thái.
5. Chạy lại các ca thành công và thất bại trên môi trường thử có đủ nguồn, cùng kiểm thử giao diện từ đầu đến cuối. Chưa thể kết luận toàn bộ phần khách hàng đạt chỉ dựa trên các ca đang chạy được.

## Kiểm thử cục bộ

`backend/tests/customer-flow-postgres.mjs` chỉ chạy khi có xác nhận biến `QTKD_CUSTOMER_TEST_DISPOSABLE=true`, nhận cổng PostgreSQL loopback qua `QTKD_CUSTOMER_TEST_PORT`, và giả định database `qtkdtest` là database thử riêng đã chạy migration. Script tạo các tài khoản và hồ sơ tổng hợp; không dọn dữ liệu trong database. API thử phải chạy trên `127.0.0.1:7156` với cấu hình trỏ vào database thử.

`frontend/tests/customer-flow-browser.mjs` kiểm thử giao diện qua API thử và các tài khoản tổng hợp do script backend tạo; cần Playwright, đường dẫn trình duyệt và các biến môi trường được nêu trong script. `frontend/tests/customer-suspend-mock-browser.mjs` kiểm tra thẻ rà soát trên hai kích thước màn hình bằng dữ liệu demo tại cổng 5174, không thay thế kiểm thử chuyển trạng thái với dữ liệu thật. Không chạy các bài này đối với Supabase dùng chung.
