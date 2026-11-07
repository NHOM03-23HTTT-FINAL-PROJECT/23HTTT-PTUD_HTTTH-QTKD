# SYS-CTR-10 — Phân công người duyệt hồ sơ hợp đồng

Cập nhật 07/11/2026 theo SYS-CTR-10 / US-CTR-29 trong đặc tả nghiệp vụ và feedback ghép luồng SYS-CTR-07/08/09.

## Phạm vi và quyền

- Trưởng phòng Pháp chế phân công bước Rà soát pháp lý; Giám đốc phân công bước Phê duyệt.
- Người gọi phải có `approvals.assign`, tài khoản hoạt động và là `department.manager_id` của phòng phụ trách bước.
- Bước Kinh doanh được giao tự động khi trình hồ sơ cho Trưởng phòng Kinh doanh của phòng sở hữu, không phân công qua UC này.
- Mỗi bước chỉ có một người được giao. Người được giao không thay đổi sau khi phân công, kể cả trước khi tiếp nhận.

## Tiền điều kiện

- Hợp đồng UnderReview, lượt duyệt đang chạy; phiên bản hiện tại khớp bản được trình.
- Bước hiện tại đang Chờ phân công và chưa có người được giao.
- Mọi bước trước đã chấp thuận trên cùng phiên bản. Không phân công trước lượt.

## Dòng cơ bản

1. Trưởng bộ phận mở **Phân công người duyệt** hoặc thông báo **Hồ sơ chờ phân công**.
2. Hệ thống chỉ liệt kê hồ sơ đã đến bước của bộ phận và đang chờ phân công.
3. Người dùng chọn **Phân công**; hệ thống tải danh sách người còn hoạt động, đúng vai trò, đúng phòng ban thực tế, có quyền duyệt và không phải người lập hồ sơ.
4. Trưởng bộ phận chọn một người rồi xác nhận, hoặc chọn **Tự nhận** nếu bản thân thuộc danh sách hợp lệ.
5. BE khóa hợp đồng và kiểm tra lại quyền, trưởng bộ phận, bước, phiên bản và người được chọn.
6. BE lưu người được giao một lần, thời điểm giao, chuyển bước sang **Chờ tiếp nhận**, ghi nhật ký và lưu thông báo chờ gửi trong cùng giao dịch.
7. Hồ sơ rời danh sách chờ phân công. Người được giao tiếp nhận trước khi quyết định.

## Ngoại lệ

- Không đủ quyền hoặc không quản lý phòng phụ trách bước: 403 `FORBIDDEN`.
- Chưa đến lượt hoặc đã có người được giao: 409 `ASSIGNMENT_IMMUTABLE`. Gửi lại cùng người cũng không tạo thêm phân công hay thông báo.
- Hai yêu cầu phân công đồng thời: một yêu cầu thành công; yêu cầu còn lại nhận xung đột. Không chuyển người đã được giao.
- Lượt đã kết thúc: 409 `STEP_DONE`; khác lượt/phiên bản: yêu cầu tải lại trước khi xử lý.
- Người nhận không hợp lệ, bị khóa, sai phòng ban/vai trò, thiếu quyền hoặc là người lập: 400 `INVALID_ASSIGNEE`.
- Đóng hộp thoại không làm thay đổi hồ sơ. Lỗi lưu phải rollback toàn bộ phân công, nhật ký và thông báo.

## Liên kết SYS-CTR-07/08/09

- TPKD chấp thuận → bước Pháp chế Chờ phân công và Trưởng phòng Pháp chế nhận thông báo.
- Nhân viên Pháp chế xác nhận **Chấp thuận và trình Ban Giám đốc** một lần; BE lưu kết luận và chuyển bước nguyên tử trong cùng lượt duyệt. Không cần nút trình riêng.
- Bước Phê duyệt Chờ phân công và Giám đốc nhận thông báo; Giám đốc giao cho thành viên Ban Giám đốc hoặc tự nhận.
- Chỉ người được giao mới tiếp nhận và phê duyệt; hồ sơ chỉ Approved sau khi bước cuối chấp thuận hợp lệ.
- Tiến độ, nhật ký và thông báo thể hiện phân công, tiếp nhận, kết luận và chuyển bước. Lỗi gửi thông báo không thực hiện lại quyết định.

## Migration và tương thích

- EF Core là nguồn migration duy nhất. `20261107000100_ApprovalAssignmentOnce` bổ sung ràng buộc DB: chỉ gán lần đầu cho bước NotStarted đã đến lượt và chuyển sang Pending.
- Áp migration bằng `QTKD.DbTool` theo quy trình DB của nhóm; không tự áp lên Supabase chung.
- Không viết lại lịch sử, snapshot, người được giao hoặc kết luận cũ. Bước NotStarted đã đến lượt được đọc thành Chờ phân công hoặc Chờ tiếp nhận tùy đã có người nhận; hồ sơ cũ không mắc kẹt ở nút trình riêng.
