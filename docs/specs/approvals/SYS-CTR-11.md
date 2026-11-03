# SYS-CTR-11 — Theo dõi tiến độ và lịch sử phê duyệt hợp đồng

| Mục | Nội dung |
|---|---|
| Tác nhân | Người dùng có quyền xem hợp đồng (Nhân viên Kinh doanh phụ trách, Trưởng phòng Kinh doanh, Nhân viên Pháp chế, thành viên Ban Giám đốc, người quản lý cấp cao) trong phạm vi được phân quyền. |
| Mục tiêu | Xem hồ sơ hợp đồng hoặc phụ lục đang ở bước duyệt nào, ai đang giữ, các bước đã hoàn thành và còn lại, cùng lịch sử trình, rà soát, quyết định và phân công theo từng lượt duyệt, để chủ động phối hợp và truy vết khi cần giải trình. (US-CTR-30 – Theo dõi tiến độ và lịch sử phê duyệt hợp đồng, phụ lục) |
| Kích hoạt | Người dùng chọn "Tiến độ và lịch sử phê duyệt" tại khu vực tiến độ trình duyệt trên màn hình chi tiết hợp đồng (SYS-CTR-06 – Xem chi tiết hợp đồng, bước 7). Hoặc người dùng chọn mục "Theo dõi tiến độ" trên thanh điều hướng, rồi chọn một hợp đồng trong danh sách (A10). |

## Tiền điều kiện

- Người dùng đã đăng nhập và có quyền xem hợp đồng.
- Hồ sơ tồn tại và thuộc phạm vi truy cập của người dùng (SYS-CTR-02 – Xem danh sách và thông tin hợp đồng theo quyền hạn).

## Hậu điều kiện

- Hệ thống hiển thị tiến độ và lịch sử phê duyệt của đúng hồ sơ, trong phạm vi được phép xem.
- Không làm thay đổi nội dung, trạng thái hồ sơ, người được giao, kết quả duyệt hoặc lịch sử đã ghi nhận.

## Dòng cơ bản

1. Người dùng mở màn hình chi tiết hợp đồng và chọn "Tiến độ và lịch sử phê duyệt". Hoặc người dùng chọn một hợp đồng trong danh sách "Theo dõi tiến độ" (A10).
2. Hệ thống kiểm tra quyền xem và phạm vi truy cập hồ sơ theo vai trò của người dùng.
3. Hệ thống xác định các lượt duyệt của hồ sơ và chọn mặc định lượt gần nhất.
4. Hệ thống hiển thị thông tin lượt duyệt: thứ tự lượt, người trình, thời điểm trình, phiên bản hồ sơ được trình, trạng thái hiện tại của hồ sơ và kết quả lượt (Đang xử lý, Hoàn tất, Yêu cầu chỉnh sửa, Bị từ chối, Đã rút).
5. Hệ thống hiển thị tuyến duyệt của lượt: Trưởng phòng Kinh doanh → Pháp chế → Ban Giám đốc, người duyệt từng bước do trưởng bộ phận phụ trách phân công (SYS-CTR-10), đánh dấu từng bước Đã hoàn thành, Đang xử lý hoặc Chưa đến lượt.
6. Với bước đang xử lý, hệ thống hiển thị người được giao, thời điểm giao và tình trạng của bước: Chờ tiếp nhận, Đang rà soát (kèm thời điểm tiếp nhận) hoặc Chờ chuyển bước (bước trước đã chấp thuận, chờ gửi hồ sơ sang bước sau theo UC-CTR-02).
7. Với bước đã hoàn thành, hệ thống hiển thị người thực hiện, thời điểm, kết quả, ý kiến hoặc kết luận và phiên bản hồ sơ được rà soát trong phạm vi được phép xem.
8. Người dùng chọn "Lịch sử xử lý".
9. Hệ thống hiển thị nhật ký của lượt theo thứ tự thời gian, gồm các hành động: trình duyệt, tiếp nhận rà soát, chấp thuận, gửi hồ sơ sang Pháp chế, trình Ban Giám đốc, phê duyệt, yêu cầu chỉnh sửa, từ chối, rút hồ sơ và phân công người được giao; mỗi dòng gồm bước, người thực hiện, thời điểm, hành động, trạng thái trước và sau, ý kiến hoặc lý do, phiên bản hồ sơ.
10. Người dùng đóng màn hình; hệ thống trở về màn hình chi tiết hợp đồng, dữ liệu hồ sơ giữ nguyên.

## Dòng thay thế

### A1 — Hồ sơ chưa từng được trình duyệt (bước 3)

- Hệ thống hiển thị trạng thái Draft và thông báo "Hồ sơ chưa được trình duyệt".
- Hệ thống không hiển thị tuyến duyệt như thể quy trình đã bắt đầu (thống nhất với SYS-CTR-06 – Xem chi tiết hợp đồng, A2).
- Use Case kết thúc.

### A2 — Hồ sơ có nhiều lượt duyệt (bước 3)

- Hệ thống hiển thị danh sách các lượt gồm thứ tự lượt, thời điểm trình và kết quả lượt.
- Người dùng chọn một lượt; hệ thống hiển thị bước 4 đến bước 9 cho lượt đó ở chế độ chỉ xem.
- Hệ thống ghi rõ kết quả của lượt cũ không được áp dụng cho lượt mới; lượt trình lại bắt đầu từ bước Trưởng phòng Kinh doanh (SYS-CTR-04 – Trình duyệt hợp đồng, A1).

### A3 — Lượt đã kết thúc do yêu cầu chỉnh sửa hoặc từ chối (bước 4)

- Hệ thống hiển thị bước đã dừng lượt, người quyết định, thời điểm và nội dung chỉnh sửa hoặc lý do từ chối (SYS-CTR-07 A1, A2; SYS-CTR-08 A2, A3; SYS-CTR-09 A1, A2).
- Các bước sau bước dừng được ghi "Không thực hiện"; hệ thống không hiển thị người nào còn đang chờ xử lý trong lượt.
- Nếu hồ sơ ở trạng thái Yêu cầu chỉnh sửa, hệ thống ghi chú hồ sơ đang chờ chỉnh sửa (SYS-CTR-03 – Chỉnh sửa hợp đồng) và trình lại.

### A4 — Hồ sơ đã được rút trước khi rà soát (bước 4)

- Hệ thống hiển thị lượt với kết quả Đã rút, người rút và thời điểm rút (US-CTR-17 – Rút hồ sơ đã trình nhưng chưa được rà soát).
- Hồ sơ hiển thị trạng thái Draft; lượt đã rút không hiển thị bước đang xử lý.

### A5 — Hồ sơ là phụ lục có bước xác nhận của bộ phận liên quan (bước 5)

- Hệ thống hiển thị thêm bước xác nhận của bộ phận liên quan sau bước Trưởng phòng Kinh doanh nếu lượt có bước này.
- Nếu lượt không có bước này, hệ thống không hiển thị bước.

### A6 — Bước hiện tại chưa được phân công (bước 6)

- Hệ thống hiển thị bước ở tình trạng "Đang chờ phân công" (SYS-CTR-08 – Rà soát pháp lý hợp đồng, A4; trưởng bộ phận phân công theo SYS-CTR-10), không hiển thị người nhận giả định.

### A7 — Hồ sơ đã được phê duyệt (bước 5)

- Hệ thống đánh dấu toàn bộ các bước Đã hoàn thành, hiển thị thời điểm hoàn tất lượt và phiên bản hợp đồng được duyệt (SYS-CTR-09 – Phê duyệt hợp đồng ở cấp Ban Giám đốc).
- Tiến độ ký kết thuộc UC-CTR-03 (US-CTR-07 – Quản lý quá trình ký kết hợp đồng), không hiển thị trong Use Case này.

### A8 — Lọc lịch sử xử lý (bước 9)

- Người dùng lọc theo bước, loại hành động hoặc người thực hiện; hệ thống cập nhật danh sách.
- Nếu không có dòng nào thỏa điều kiện, hệ thống thông báo không có kết quả; người dùng có thể xóa bộ lọc.

### A9 — Ý kiến hoặc kết luận nằm ngoài phạm vi được xem (bước 7, 9)

- Hệ thống ẩn nội dung ý kiến, kết luận; chỉ hiển thị người thực hiện, thời điểm và kết quả của bước.

### A10 — Mở từ mục "Theo dõi tiến độ" (bước 1)

- Người dùng chọn mục "Theo dõi tiến độ" trên thanh điều hướng.
- Hệ thống hiển thị danh sách hợp đồng đã được trình duyệt ít nhất một lượt và thuộc phạm vi được xem của người dùng, gồm mã hợp đồng, tiêu đề, khách hàng, trạng thái, bước đang xử lý và người phụ trách. Nếu không có hợp đồng nào, hệ thống thông báo chưa có hồ sơ đã trình duyệt.
- Người dùng chọn một hợp đồng; hệ thống mở ngay màn hình tiến độ và lịch sử phê duyệt của hợp đồng đó, không qua màn hình chi tiết hợp đồng, và tiếp tục từ bước 2.
- Khi người dùng đóng màn hình ở bước 10, hệ thống trở về danh sách "Theo dõi tiến độ".

## Dòng ngoại lệ

### E1 — Người dùng không được phép xem hồ sơ

- Hệ thống từ chối truy cập và không cung cấp thông tin tiến độ, lịch sử của hồ sơ ngoài phạm vi.
- Người dùng có thể quay lại danh sách hợp đồng.

### E2 — Hồ sơ không tồn tại hoặc không còn khả dụng

- Hệ thống thông báo không tìm thấy hồ sơ có thể truy cập và không hiển thị dữ liệu phê duyệt.

### E3 — Không thể truy xuất tiến độ hoặc lịch sử

- Hệ thống thông báo không thể tải thông tin, không hiển thị dữ liệu chưa được xác thực.
- Người dùng có thể tải lại hoặc trở về màn hình chi tiết hợp đồng.

### E4 — Tiến độ thay đổi trong lúc người dùng đang xem

- Hệ thống hiển thị thời điểm cập nhật của dữ liệu đang xem.
- Khi người dùng tải lại, hệ thống hiển thị tình trạng mới nhất; không ghép kết quả cũ và mới trên cùng một màn hình.

### E5 — Yêu cầu sửa hoặc xóa lịch sử

- Hệ thống không cung cấp thao tác sửa, xóa dòng lịch sử và từ chối mọi yêu cầu thay đổi kết quả đã ghi nhận.
