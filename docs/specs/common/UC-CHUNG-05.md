# UC-CHUNG-05 — Xem thông báo

| Mục | Nội dung |
|---|---|
| Tên UC | Xem thông báo |
| Use case ID | UC-CHUNG-05 |
| Mô tả | Use case mô tả quá trình người dùng nội bộ xem các thông báo gửi cho mình (hồ sơ cần xử lý, hồ sơ chờ phân công, kết quả duyệt, yêu cầu chỉnh sửa, kết quả ký…), đánh dấu đã đọc và mở đúng hồ sơ liên quan để xử lý. |
| Actor | Nhân viên/Trưởng phòng Kinh doanh, Nhân viên/Trưởng phòng Khai thác, Nhân viên Kế toán, Nhân viên Pháp chế, Ban Giám đốc, Quản trị hệ thống |
| Độ ưu tiên | Trung bình |
| Trigger | Người dùng chọn biểu tượng "Thông báo" trên thanh điều hướng, chọn khối "Thông báo chưa đọc" ở trang làm việc (UC-CHUNG-01), hoặc bấm đường dẫn hồ sơ trong email thông báo. |

## Tiền điều kiện

1. Người dùng đã đăng nhập (UC-CHUNG-01).
2. Tài khoản ở trạng thái "Đang hoạt động".

## Hậu điều kiện

Thành công:

- Người dùng xem được các thông báo có người nhận là chính mình.
- Thông báo đã mở (hoặc được đánh dấu) chuyển sang "Đã đọc"; số thông báo chưa đọc được cập nhật.
- Nếu người dùng mở thông báo, hệ thống chuyển đến đúng hồ sơ liên quan theo quyền truy cập.
- Việc xem thông báo không làm thay đổi nội dung hay trạng thái hồ sơ.

Thất bại:

- Trạng thái đọc của thông báo giữ nguyên; không hiển thị thông báo của người khác.

## Luồng cơ bản

1. Người dùng chọn "Thông báo".
2. Hệ thống lấy các thông báo có người nhận là người dùng, sắp xếp mới nhất trước và phân trang.
3. Hệ thống hiển thị danh sách thông báo gồm nội dung, loại và mã hồ sơ liên quan, thời điểm, trạng thái đọc (thông báo chưa đọc được in đậm) và tổng số thông báo chưa đọc.
4. Người dùng chọn một thông báo.
5. Hệ thống chuyển thông báo sang "Đã đọc" và cập nhật số thông báo chưa đọc.
6. Hệ thống kiểm tra hồ sơ liên quan còn tồn tại và người dùng có quyền truy cập hồ sơ đó.
7. Hệ thống mở đúng màn hình xử lý hoặc xem hồ sơ liên quan, ví dụ: phân công người duyệt (SYS-CTR-10), rà soát hợp đồng (SYS-CTR-07, 08, 09), tiến độ phê duyệt (SYS-CTR-11), phê duyệt bảng thanh toán (UC-SYS-04), xác nhận sản lượng khi đối soát (UC-SYS-02).
8. Kết thúc use case.

## Luồng thay thế

### A1 — Lọc thông báo (tại bước 3)

Người dùng chọn "Tất cả" hoặc "Chưa đọc" → hệ thống hiển thị lại danh sách theo bộ lọc, giữ phân trang. Quay lại bước 3.

### A2 — Đánh dấu tất cả đã đọc (tại bước 3)

Người dùng chọn "Đánh dấu tất cả đã đọc" → hệ thống chuyển mọi thông báo chưa đọc của người dùng sang "Đã đọc", số chưa đọc về 0. Quay lại bước 3.

### A3 — Chưa có thông báo (tại bước 3)

Hệ thống hiển thị "Bạn chưa có thông báo nào". Kết thúc use case.

### A4 — Mở từ email khi chưa đăng nhập (trước bước 1)

Hệ thống chuyển đến đăng nhập (UC-CHUNG-01, A3); sau khi đăng nhập thành công, tiếp tục từ bước 5 với thông báo tương ứng.

### A5 — Thông báo chung, không gắn hồ sơ (tại bước 6)

Hệ thống chỉ đánh dấu đã đọc và hiển thị toàn văn nội dung; người dùng ở lại danh sách. Kết thúc use case.

## Luồng ngoại lệ

### E1 — Không còn quyền với hồ sơ (tại bước 6)

Hệ thống hiển thị "Bạn không có quyền truy cập nội dung này", không mở hồ sơ; thông báo vẫn ở trạng thái "Đã đọc". Quay lại bước 3.

### E2 — Hồ sơ không còn khả dụng (tại bước 6)

Hồ sơ đã bị xóa khỏi phạm vi xem hoặc không tìm thấy → hệ thống hiển thị "Hồ sơ không còn khả dụng". Quay lại bước 3.

### E3 — Hồ sơ đã được người khác xử lý (tại bước 7)

Thông báo yêu cầu xử lý nhưng bước đã hoàn thành hoặc lượt duyệt đã kết thúc → hệ thống mở hồ sơ ở chế độ xem, hiển thị trạng thái mới nhất, không cho thao tác trên bước cũ.

### E4 — Lỗi tải danh sách (tại bước 2)

Hệ thống hiển thị "Không tải được thông báo" kèm nút "Tải lại"; không hiển thị "Bạn chưa có thông báo nào" thay cho lỗi.

### E5 — Lỗi cập nhật trạng thái đọc (tại bước 5)

Hệ thống vẫn mở hồ sơ, giữ thông báo ở "Chưa đọc" và thử cập nhật lại ở lần mở sau.
