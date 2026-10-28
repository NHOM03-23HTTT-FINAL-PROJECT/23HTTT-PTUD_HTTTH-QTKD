# Quy tắc nghiệp vụ cho Sprint 1

Nguồn chính: [PDF](../docs/sources/QTKD_DATH%20%281%29.pdf), mục 4.7, 4.10, 5.1, 5.4 và 5.5. Chi tiết triển khai trong [workbook](../docs/sources/SprintPlan_QTKD.xlsx), TASK-013, 018, 023-024, 040-041, 051-057 và 060-067. Nội dung này là yêu cầu cho lần triển khai sau.

## Hợp đồng

| Rule PDF | Ràng buộc |
| --- | --- |
| CTR-01 | Chỉ chỉnh sửa ở Draft hoặc Revision Requested. Product Backlog của US-CTR-16 còn yêu cầu kiểm tra người phụ trách hồ sơ. |
| CTR-02 | Submit cần khách hàng hợp lệ, thời gian hiệu lực hợp lệ và ít nhất một tệp/hạng mục nội dung bắt buộc. Danh sách bắt buộc cụ thể cần tra đặc tả. |
| CTR-03 | Không chuyển thẳng Draft sang Approved; phải qua workflow. |
| CTR-04 | Rejected không được tự sửa và submit lại. Nhóm cần thiết kế bản chỉnh sửa hoặc đường chuyển về Revision. |
| CTR-05 | Approved chỉ thành Active khi đến ngày hiệu lực. Job tự chuyển trạng thái nằm ở Sprint 2; MVP1 kết thúc tại Approved. |
| CTR-06 | Không xóa hợp đồng Active; xử lý Cancelled/Expired theo nghiệp vụ. Không nhầm với thao tác hủy dự thảo trong Sprint 1. |
| CTR-07 | Thay đổi điều khoản quan trọng khi Approved/Active phải qua phụ lục. Phụ lục thuộc Sprint 2. |

Khi triển khai submit/sửa/hủy, kiểm tra trạng thái và quyền tại BE trước khi ghi dữ liệu. Không tự đặt tên trạng thái trung gian hoặc đường chuyển trạng thái chưa có trong đặc tả.

## Phê duyệt

- **Cấu hình được:** workflow không hard-code một chuỗi if/else cho từng hồ sơ. TASK-051/052 nêu definition, step, instance, task, approval_action.
- **Phiên bản và snapshot:** TASK-053/054 nêu cấu hình có phiên bản, snapshot khi khởi tạo lượt. Product Backlog của US-APR-10 ghi thay đổi cấu hình không tự đổi thứ tự/phân công lượt đang chạy.
- **APR-01:** phải là assignee ở bước hiện tại; có role phù hợp vẫn chưa đủ quyền duyệt.
- **APR-02:** không nhảy bước hoặc duyệt lại bước đã hoàn thành.
- **APR-03:** hành động duyệt cần ghi nhận comment; reject/request revision phải có lý do. TASK-055 ghi comment bắt buộc.
- **APR-04:** reject kết thúc ở Rejected hoặc về Revision theo quy tắc nhóm thiết kế; chưa tự chọn nhánh.
- **APR-05:** chỉ hoàn tất bước cuối mới chuyển hồ sơ Approved. Gửi ký là bước nghiệp vụ sau, chưa triển khai trong Sprint 1.
- **Theo dõi:** hiển thị người đang xử lý, bước xong/còn lại và lịch sử các lượt (TASK-035/036).

Luồng hợp đồng ba cấp là dữ liệu cấu hình cho MVP1, không phải cấu trúc engine cố định cho tất cả loại hồ sơ.

## Nhất quán và truy vết

- **Double submit:** request lặp không tạo nhiều workflow instance cho cùng lần trình. TASK-054 nêu Idempotency-Key; cần phân biệt retry một lần trình với lần trình lại hợp lệ sau chỉnh sửa.
- **Duyệt đồng thời:** hai request không hoàn tất cùng bước hai lần. TASK-055 nêu optimistic locking; cập nhật bước và trạng thái hồ sơ phải giữ nhất quán trong transaction phù hợp.
- **Audit:** lưu người thao tác, thời điểm, hành động, trạng thái trước/sau, ghi chú; tra cứu theo hồ sơ và không phụ thuộc dữ liệu hiển thị hiện tại. TASK-024 nêu bảng append-only và interceptor SaveChanges.
- **Khách hàng:** TASK-013 nêu unique mã và MST; TASK-018 nêu lý do khi tạm ngưng/kích hoạt lại, chặn chọn khách hàng Suspended.
- **Khu vực:** TASK-041 nêu tối đa ba cấp và chặn vòng lặp; TASK-042 nêu lookup khu vực Active cho hợp đồng.

## Ràng buộc của giai đoạn sau

PDF còn yêu cầu phiên ký có trạng thái riêng, callback bất đồng bộ, retry khi dịch vụ ngoài lỗi, lưu đơn giá thanh toán tại thời điểm tính và tránh mất event. Kế hoạch đưa các phần này vào Sprint 2/3. Giữ ranh giới để mở rộng, chỉ triển khai khi được giao đúng hạng mục.
