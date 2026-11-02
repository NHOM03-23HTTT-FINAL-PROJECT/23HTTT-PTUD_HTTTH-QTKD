# ADR 0001: Một role bắt buộc cho mỗi tài khoản

- Trạng thái: Accepted
- Ngày chốt: 2026-11-02
- Người chốt: người giao TASK-022/023 trong cuộc trao đổi triển khai.
- Phạm vi: PB-02, TASK-022/023; FE phối hợp TASK-025.

## Bối cảnh và quyết định

DB đã yêu cầu `user_account.role NOT NULL`, trong khi prototype có nhiều role và nhánh NO_ROLE. Mỗi tài khoản được cấp kèm đúng một role. DTO giữ `roles: [role]` để tương thích FE; không hỗ trợ nhiều role.

Role hợp lệ có thể có zero permission và vẫn đăng nhập. Thiếu permission ở endpoint trả 403, không kết thúc phiên. Payload cấp tài khoản thiếu role trả 400. Dữ liệu/config không ánh xạ được role gây lỗi hệ thống 500, không tạo phiên; FE chỉ nhận SYSTEM_ERROR. Loại bỏ nhánh NO_ROLE/no-role và hai mock không có role.

## Kiểm chứng

Test đăng nhập role không có permission, 403/200 trên cùng endpoint, payload thiếu role, lỗi mapping role không tạo session. Không bỏ NOT NULL để dựng test dữ liệu hỏng.

## Tác động

FE không suy ra quyền chỉ từ role. Role/phòng ban/quyền do BE kiểm tra. Quyết định được chấp thuận không đồng nghĩa triển khai và kiểm thử đã hoàn tất.
