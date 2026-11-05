# SYS-CTR-10 — Phân công người duyệt hồ sơ hợp đồng

> Sửa ngày 03/11/2026, thay bản "Cấu hình người tham gia hồ sơ hợp đồng và phụ lục (từ lập đến ký kết)". Nhóm đã đồng ý bỏ cấu hình theo phiên bản: người duyệt được phân công cho từng hồ sơ, chỉ ở các bước duyệt, do trưởng bộ phận phụ trách bước thực hiện. Nội dung này khác AC-01 → AC-06 của US-CTR-29 trong workbook.

| Mục | Nội dung |
|---|---|
| Tác nhân | Trưởng bộ phận phụ trách bước duyệt: Trưởng phòng Kinh doanh của phòng sở hữu hồ sơ (bước Rà soát kinh doanh), Trưởng phòng Pháp chế (bước Rà soát pháp lý), Tổng Giám đốc (bước Phê duyệt). Người phân công phải có vai trò trưởng (quyền `approvals.assign`) và được ghi nhận quản lý phòng ban (`department.manager_id`). Trưởng phòng Pháp chế và Tổng Giám đốc có giao diện như nhân viên của bộ phận, cộng tab "Phân công người duyệt". |
| Mục tiêu | Chỉ định người duyệt cho từng bước duyệt của từng hồ sơ hợp đồng đang trong lượt duyệt, để hồ sơ không bị dừng ở bước "Đang chờ phân công" và mỗi bộ phận tự điều phối người duyệt của mình. |
| Kích hoạt | Trưởng bộ phận chọn "Phân công người duyệt" trong mục Phê duyệt. |

## Phạm vi

- Chỉ áp dụng cho 3 bước duyệt theo thứ tự: Rà soát kinh doanh → Rà soát pháp lý → Phê duyệt. Không phân công bước Lập & trình hoặc Ký kết.
- Mỗi trưởng bộ phận chỉ phân công bước của bộ phận mình; không phân công bước của bộ phận khác.
- Phân công theo từng hồ sơ; không có cấu hình mặc định hay phiên bản cấu hình.

## Tiền điều kiện

- Người dùng đã đăng nhập, tài khoản hoạt động, có quyền `approvals.assign` và là trưởng của phòng ban phụ trách bước.
- Hồ sơ có lượt duyệt đang chạy (đã trình theo SYS-CTR-04).

## Hậu điều kiện

- Thành công: bước được ghi người duyệt mới; người được phân công nhận thông báo, người bị thay (nếu có) cũng được báo; nhật ký ghi người phân công, thời điểm, người trước và người sau.
- Nếu bước đã tới lượt (các bước trước đã chấp thuận và không chờ bàn giao), bước được kích hoạt ngay: Rà soát kinh doanh chuyển sang Chờ tiếp nhận, các bước khác chuyển sang Đang rà soát.
- Thất bại: người duyệt, trạng thái bước và lượt duyệt giữ nguyên.

## Dòng cơ bản

1. Trưởng bộ phận mở "Phân công người duyệt".
2. Hệ thống kiểm tra quyền và hiển thị các hồ sơ đang trong lượt duyệt có bước thuộc bộ phận của người dùng, mặc định chỉ hồ sơ còn bước chưa phân công. Mỗi dòng gồm hồ sơ, khách hàng, người lập, giá trị, thời điểm trình, lượt; với từng bước người dùng phụ trách: tên bước, người duyệt hiện tại và tình trạng (Chưa phân công, Chưa tới lượt, Chờ tiếp nhận, Đang rà soát, Đã xử lý, Không thực hiện).
3. Trưởng bộ phận chọn "Phân công" tại một bước chưa có người duyệt.
4. Hệ thống hiển thị danh sách người có thể chọn: còn hoạt động, đúng vai trò duyệt của bước (nhân viên hoặc trưởng phòng của bộ phận, kể cả chính người phân công), có quyền duyệt bước; với bước Rà soát kinh doanh phải cùng phòng sở hữu hồ sơ; không gồm người lập hồ sơ.
5. Trưởng bộ phận chọn người duyệt và xác nhận.
6. Hệ thống kiểm tra lại quyền, phạm vi phụ trách, lượt và phiên bản hồ sơ, tình trạng bước và người được chọn; ghi người duyệt, kích hoạt bước nếu đã tới lượt, gửi thông báo và ghi nhật ký.
7. Hệ thống thông báo "Đã phân công" và cập nhật dòng hồ sơ.

## Dòng thay thế

### A1 — Đổi người duyệt (bước 3)

- Trưởng bộ phận chọn "Đổi người" tại bước đã có người duyệt nhưng chưa bắt đầu: Chưa tới lượt, hoặc Chờ tiếp nhận (đã giao nhưng chưa tiếp nhận).
- Tiếp tục từ bước 4; người bị thay nhận thông báo không còn được phân công.

### A2 — Bước đứng sau bước cần bàn giao (bước 6)

- Bước Phê duyệt chỉ bắt đầu khi Pháp chế bàn giao hồ sơ lên Ban Giám đốc (SYS-CTR-08). Phân công trước hoặc sau khi Pháp chế chấp thuận đều chỉ ghi người duyệt; bước được kích hoạt khi Pháp chế bàn giao.

### A3 — Xem cả hồ sơ đã đủ người (bước 2)

- Trưởng bộ phận bỏ lọc "Chỉ hồ sơ còn bước chưa phân công"; hệ thống hiển thị mọi hồ sơ đang trong lượt duyệt có bước thuộc bộ phận, để đổi người khi cần (A1).

### A4 — Không có hồ sơ cần phân công (bước 2)

- Hệ thống thông báo không có hồ sơ cần phân công.

## Dòng ngoại lệ

### E1 — Không có quyền hoặc không phải trưởng bộ phận phụ trách bước (bước 2, 6)

- Hệ thống từ chối thao tác; không thay đổi người duyệt.

### E2 — Bước đã bắt đầu hoặc lượt đã kết thúc (bước 6)

- Bước đang rà soát, đã có quyết định, không thực hiện, hoặc lượt đã kết thúc: hệ thống từ chối đổi người.

### E3 — Người được chọn không hợp lệ (bước 6)

- Người không còn hoạt động, sai vai trò, thiếu quyền duyệt, khác phòng (bước Rà soát kinh doanh) hoặc là người lập hồ sơ: hệ thống từ chối, yêu cầu chọn người khác.

### E4 — Hồ sơ hoặc lượt duyệt thay đổi trong lúc phân công (bước 6)

- Lượt hoặc phiên bản hồ sơ khác lúc mở: hệ thống không ghi, yêu cầu tải lại.

### E5 — Không có người phù hợp (bước 4)

- Hệ thống thông báo không có người phù hợp cho bước; bước giữ tình trạng Chưa phân công và không bị bỏ qua.

### E6 — Gửi lại cùng lựa chọn (bước 5–6)

- Bước đã được gán đúng người được chọn: hệ thống không ghi thêm và trả kết quả hiện tại.

## Ảnh hưởng tới UC khác

- SYS-CTR-04: khi trình, bước đầu được giao theo phân công; bước chưa có người ở trạng thái Chưa phân công, không bị bỏ qua.
- SYS-CTR-08 A4: bước "Đang chờ phân công" do trưởng bộ phận phụ trách xử lý theo UC này.
- SYS-CTR-11 bước 4: lượt duyệt không còn "phiên bản cấu hình quy trình"; người duyệt từng bước là người được trưởng bộ phận phân công.
