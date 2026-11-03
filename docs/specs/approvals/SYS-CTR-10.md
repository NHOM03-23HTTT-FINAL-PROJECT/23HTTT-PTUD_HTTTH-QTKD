# SYS-CTR-10 — Cấu hình người tham gia hồ sơ hợp đồng và phụ lục (từ lập đến ký kết)

| Mục | Nội dung |
|---|---|
| Tác nhân | Quản trị hệ thống được cấp quyền quản trị quy trình của phân hệ Hợp đồng. |
| Mục tiêu | Quy định người tham gia ở từng giai đoạn của hồ sơ thuộc phân hệ Hợp đồng – Lập & trình hồ sơ, Rà soát kinh doanh, Rà soát pháp lý, Phê duyệt và Ký kết – theo loại hồ sơ và phạm vi phòng ban. Cấu hình được lưu thành phiên bản; mỗi hồ sơ dùng phiên bản đang áp dụng tại thời điểm trình và không bị thay đổi bởi các lần cập nhật sau. (US-CTR-29 – Cấu hình quy trình phê duyệt hợp đồng và phụ lục (AC-01 → AC-06)) |
| Kích hoạt | Quản trị hệ thống chọn "Quy trình phê duyệt" trong phân hệ Hợp đồng để mở màn hình "Cấu hình người tham gia". |

## Tiền điều kiện

- Người dùng đã đăng nhập và có quyền quản trị quy trình của phân hệ Hợp đồng.
- Danh mục loại hồ sơ, phòng ban, vai trò và người dùng (kèm thẩm quyền ký) đã được thiết lập.

## Hậu điều kiện

- Thành công: cấu hình hợp lệ được lưu thành phiên bản mới và trở thành phiên bản đang áp dụng duy nhất của loại hồ sơ + phạm vi phòng ban cho các hồ sơ lập và trình sau đó (SYS-CTR-01 – Tạo hồ sơ hợp đồng, SYS-CTR-04 – Trình duyệt hợp đồng); người được giao ở từng giai đoạn được xác định theo cấu hình này; nhật ký thay đổi ghi nhận người cập nhật, thời điểm và nội dung thay đổi.
- Các lượt duyệt đã tạo giữ nguyên phiên bản cấu hình được gắn lúc trình; phiên bản cũ được lưu và vẫn được hiển thị trong tiến độ của lượt tương ứng (SYS-CTR-11 – Theo dõi tiến độ và lịch sử phê duyệt hợp đồng).
- Thất bại: không kích hoạt cấu hình; phiên bản đang áp dụng và các lượt duyệt giữ nguyên.

## Dòng cơ bản

1. Quản trị hệ thống mở chức năng "Quy trình phê duyệt".
2. Hệ thống kiểm tra quyền và hiển thị danh sách cấu hình người tham gia theo loại hồ sơ + phạm vi phòng ban, gồm mã cấu hình, loại hồ sơ · phạm vi, phiên bản đang áp dụng, thời điểm kích hoạt, trạng thái (Đang áp dụng / Chưa cấu hình) và người cập nhật.
3. Quản trị hệ thống chọn "Tạo mới", chọn loại hồ sơ (hợp đồng, phụ lục, thỏa thuận hủy hoặc biên bản chấm dứt hợp đồng) và phạm vi áp dụng (phòng ban).
4. Hệ thống hiển thị biểu mẫu gồm tên cấu hình, loại hồ sơ, phạm vi áp dụng và 5 giai đoạn cố định theo thứ tự: Lập & trình hồ sơ → Rà soát kinh doanh → Rà soát pháp lý → Phê duyệt → Ký kết. Quản trị hệ thống không thêm, xóa hoặc đảo thứ tự giai đoạn; hồ sơ chuyển sang giai đoạn sau khi giai đoạn trước chấp thuận.
5. Với mỗi giai đoạn, Quản trị hệ thống thiết lập: vai trò tham gia; cách xác định người (theo vai trò và phòng ban, chỉ định người cụ thể hoặc danh sách luân phiên); người tham gia; người dự phòng hoặc được ủy quyền; người nhận thông báo. Với giai đoạn Ký kết, Quản trị hệ thống thiết lập người ký đại diện công ty, người được ủy quyền ký và người theo dõi ký; phía khách hàng ký qua dịch vụ ký điện tử bên ngoài và không cấu hình tại đây (UC-CTR-03). Hệ thống hiển thị sơ đồ người tham gia từ lập đến ký kết.
6. Quản trị hệ thống chọn "Kiểm tra cấu hình".
7. Hệ thống kiểm tra mỗi giai đoạn xác định được ít nhất một người còn hoạt động, một người không vừa lập vừa duyệt cùng một hồ sơ, người ký đại diện có thẩm quyền ký và loại hồ sơ + phạm vi không trùng cấu hình khác; hệ thống hiển thị "Người tham gia sẽ áp dụng" theo 5 giai đoạn để quản trị xem lại và mở chức năng "Lưu và kích hoạt".
8. Quản trị hệ thống chọn "Lưu và kích hoạt" và xác nhận áp dụng cho các hồ sơ lập và trình từ thời điểm kích hoạt.
9. Hệ thống kiểm tra lại quyền và tính hợp lệ; lưu cấu hình thành phiên bản mới, đặt làm phiên bản đang áp dụng duy nhất của loại hồ sơ + phạm vi và ghi nhật ký thay đổi.
10. Hệ thống trở về danh sách cấu hình, thông báo "Kích hoạt cấu hình thành công" và hiển thị phiên bản mới; các hồ sơ đã trình tiếp tục theo phiên bản được gắn lúc trình.

## Dòng thay thế

### A1 — Cập nhật cấu hình hiện có (bước 3)

- Quản trị hệ thống chọn một cấu hình trong danh sách và chọn "Cập nhật".
- Hệ thống hiển thị người tham gia của phiên bản đang áp dụng để chỉnh sửa; giai đoạn có thay đổi được đánh dấu "Đã sửa". Tiếp tục từ bước 5.
- Khi lưu, hệ thống tạo phiên bản mới, không ghi đè phiên bản đã được các lượt duyệt sử dụng.

### A2 — Phụ lục cần xác nhận của bộ phận liên quan (bước 5)

- Quản trị hệ thống bật giai đoạn tùy chọn "Xác nhận bộ phận liên quan" sau giai đoạn Rà soát kinh doanh, kèm điều kiện áp dụng (nội dung điều chỉnh thuộc phạm vi bộ phận), bộ phận xác nhận và người tham gia (US-CTR-29, AC-03).
- Khi phụ lục không thỏa điều kiện, hồ sơ bỏ qua giai đoạn này; các giai đoạn Lập & trình, Rà soát kinh doanh, Rà soát pháp lý, Phê duyệt và Ký kết vẫn bắt buộc.
- Tiếp tục bước 6.

### A3 — Cấu hình cho thỏa thuận hủy hoặc biên bản chấm dứt (bước 3–5)

- Quản trị hệ thống thiết lập người tham gia từng giai đoạn theo UC-CTR-09.
- Việc kích hoạt cấu hình không đồng nghĩa chấp thuận hủy hoặc chấm dứt hợp đồng; từng hồ sơ vẫn phải được lập, trình và ký riêng.
- Tiếp tục bước 6.

### A4 — Không xác định được người tham gia khi hồ sơ chuyển giai đoạn

- Với giai đoạn Rà soát pháp lý, Phê duyệt và Ký kết: giai đoạn được ghi nhận "Đang chờ phân công", không bị bỏ qua; hệ thống thông báo cho người dự phòng hoặc đầu mối được cấu hình để hoàn tất phân công (SYS-CTR-08 – Rà soát pháp lý hợp đồng, A4).
- Với giai đoạn Rà soát kinh doanh: hồ sơ không được trình (SYS-CTR-04 – Trình duyệt hợp đồng, E5).
- Với giai đoạn Lập & trình: người dùng không thuộc người tham gia của phạm vi không được tạo hoặc trình hồ sơ thuộc phạm vi đó (SYS-CTR-01 – Tạo hồ sơ hợp đồng).

### A5 — Xem lịch sử phiên bản (bước 2)

- Quản trị hệ thống chọn một cấu hình và chọn "Lịch sử phiên bản".
- Hệ thống hiển thị các phiên bản, người cập nhật, thời điểm kích hoạt và nội dung thay đổi người tham gia; phiên bản cũ chỉ được xem, không được sửa hoặc kích hoạt lại trực tiếp.

### A6 — Hủy thao tác trước khi lưu (bước 3–8)

- Quản trị hệ thống chọn "Hủy" hoặc đóng biểu mẫu; nếu đã có thay đổi, hệ thống yêu cầu xác nhận.
- Hệ thống bỏ các thay đổi chưa lưu; cấu hình đang áp dụng giữ nguyên. Use Case kết thúc.

## Dòng ngoại lệ

### E1 — Người dùng không có quyền hoặc quyền bị thu hồi (bước 2, 9)

- Hệ thống từ chối thao tác và thông báo không đủ quyền; không lưu hoặc kích hoạt cấu hình.

### E2 — Cấu hình không hợp lệ (bước 7, 9)

- Nếu thiếu loại hồ sơ hoặc phạm vi áp dụng, giai đoạn chưa có người tham gia, người được chọn đã bị vô hiệu hóa, người lập trùng người duyệt cùng hồ sơ hoặc người ký đại diện không có thẩm quyền ký, hệ thống chỉ rõ lỗi tại từng giai đoạn và giữ dữ liệu đã nhập.
- Người dùng chỉnh lại từ bước 5; cấu hình chưa được kích hoạt.

### E3 — Phạm vi áp dụng trùng (bước 9)

- Nếu loại hồ sơ + phạm vi phòng ban đã có cấu hình đang áp dụng, hệ thống không kích hoạt.
- Hệ thống yêu cầu điều chỉnh phạm vi áp dụng hoặc xác nhận thay thế phiên bản đang áp dụng.

### E4 — Cấu hình bị thay đổi đồng thời (bước 9)

- Hệ thống phát hiện phiên bản đang áp dụng đã thay đổi, không ghi đè thay đổi đã lưu trước đó.
- Hệ thống yêu cầu tải lại cấu hình; người dùng kiểm tra lại trước khi xác nhận.

### E5 — Không thể lưu cấu hình hoặc nhật ký thay đổi (bước 9)

- Hệ thống thông báo kích hoạt thất bại, không ghi nhận phiên bản dở dang; phiên bản đang áp dụng giữ nguyên.
- Người dùng có thể thử lại khi sự cố được khắc phục.

### E6 — Gửi yêu cầu kích hoạt lặp lại (bước 8–10)

- Hệ thống khóa thao tác xác nhận trong lúc xử lý và kiểm tra kết quả của yêu cầu trước; không tạo hoặc kích hoạt trùng phiên bản.
