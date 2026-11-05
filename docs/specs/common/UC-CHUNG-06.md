# UC-CHUNG-06 — Tra cứu nhật ký truy vết

| Mục | Nội dung |
|---|---|
| Tên UC | Tra cứu nhật ký truy vết |
| Use case ID | UC-CHUNG-06 |
| Mô tả | Use case mô tả quá trình Quản trị hệ thống (hoặc người được cấp quyền truy vết) tra cứu nhật ký các thao tác đã thực hiện trong hệ thống — ai làm gì, lúc nào, trên đối tượng nào, giá trị trước và sau — để kiểm tra và giải trình khi có sai lệch (đề bài mục 4.10). Nhật ký chỉ được xem, không được sửa hoặc xóa. |
| Actor | Quản trị hệ thống |
| Độ ưu tiên | Trung bình |
| Trigger | Người dùng chọn "Nhật ký truy vết" trong menu quản trị, hoặc chọn "Xem nhật ký" trên màn hình chi tiết một hồ sơ. |

## Tiền điều kiện

1. Người dùng đã đăng nhập (UC-CHUNG-01).
2. Người dùng có quyền xem nhật ký truy vết.

## Hậu điều kiện

Thành công:

- Hệ thống hiển thị các dòng nhật ký thỏa điều kiện lọc, có phân trang.
- Dữ liệu nhật ký và dữ liệu nghiệp vụ không thay đổi.
- Việc tra cứu nhật ký của người dùng cũng được ghi nhận vào nhật ký.

Thất bại:

- Không hiển thị dữ liệu nhật ký; thông báo rõ nguyên nhân.

## Luồng cơ bản

1. Người dùng chọn "Nhật ký truy vết".
2. Hệ thống kiểm tra quyền và hiển thị bộ lọc: khoảng thời gian (mặc định 7 ngày gần nhất), người thực hiện, loại đối tượng (tài khoản, khách hàng, khu vực, hợp đồng, bảng giá, sản lượng, bảng thanh toán…), mã đối tượng và hành động (đăng nhập, tạo, sửa, đổi trạng thái, trình, duyệt, phân công, hủy…).
3. Người dùng nhập điều kiện lọc và chọn "Tìm".
4. Hệ thống kiểm tra điều kiện lọc hợp lệ.
5. Hệ thống truy vấn nhật ký, sắp xếp mới nhất trước và phân trang.
6. Hệ thống hiển thị danh sách gồm thời điểm, người thực hiện, hành động, loại và mã đối tượng, trạng thái trước và sau, địa chỉ IP.
7. Người dùng chọn một dòng nhật ký.
8. Hệ thống hiển thị chi tiết: giá trị trước và sau của từng trường thay đổi, ghi chú hoặc lý do kèm theo.
9. Hệ thống ghi nhận việc tra cứu vào nhật ký (người tra cứu, thời điểm, điều kiện lọc).
10. Kết thúc use case.

## Luồng thay thế

### A1 — Xem nhật ký của một hồ sơ (trước bước 2)

Người dùng chọn "Xem nhật ký" trên chi tiết hồ sơ → hệ thống điền sẵn loại và mã đối tượng, bỏ giới hạn thời gian mặc định. Tiếp tục bước 4.

### A2 — Mở đối tượng liên quan (tại bước 8)

Người dùng chọn mã đối tượng → hệ thống mở chi tiết đối tượng nếu còn tồn tại và người dùng có quyền xem.

### A3 — Không có kết quả (tại bước 6)

Hệ thống hiển thị "Không có nhật ký phù hợp với điều kiện tìm kiếm", cho phép sửa điều kiện. Quay lại bước 3.

### A4 — Đặt lại bộ lọc (tại bước 3)

Người dùng chọn "Đặt lại" → hệ thống trả bộ lọc về mặc định (7 ngày gần nhất). Quay lại bước 3.

## Luồng ngoại lệ

### E1 — Không có quyền (tại bước 2)

Hệ thống từ chối truy cập, hiển thị "Bạn không có quyền xem nhật ký truy vết". Kết thúc use case.

### E2 — Điều kiện lọc không hợp lệ (tại bước 4)

Thời điểm kết thúc trước thời điểm bắt đầu hoặc khoảng thời gian vượt giới hạn cho phép → hệ thống chỉ rõ lỗi tại trường lọc, không truy vấn. Quay lại bước 3.

### E3 — Yêu cầu sửa hoặc xóa nhật ký

Hệ thống không cung cấp thao tác sửa, xóa; mọi yêu cầu thay đổi nhật ký gửi tới Back-end đều bị từ chối và được ghi nhận.

### E4 — Lỗi truy vấn (tại bước 5)

Hệ thống hiển thị "Không tải được nhật ký" kèm nút "Tải lại"; không hiển thị "Không có nhật ký" thay cho lỗi.
