# API Identity — TASK-022/023

Tiền tố /api/v1. Hợp đồng theo ADR 0001–0003, được chốt Phase 0 ngày 02/11/2026.
Đã có source và đăng nhập thật theo bàn giao; integration BE/PostgreSQL chưa có suite PASS đầy đủ. Xem [bằng chứng kiểm tra](../../testing/test-cases/identity.md), không suy ra API đã nghiệm thu từ tài liệu này.

## Quy tắc chung

- JWT qua Authorization: Bearer. Không nhận userId/signedInAt làm bằng chứng đăng nhập.
- Có đúng một role bắt buộc. DTO roles là array đúng một phần tử. permissions do BE trả, có thể rỗng.
- 401: token/phiên không hợp lệ. 403: đã xác thực nhưng thiếu quyền, hoặc phải đổi mật khẩu trước. Không kết thúc phiên chỉ vì 403.
- Role/data/config lỗi trong đăng nhập: 500 SYSTEM_ERROR và không tạo session. Không có nhánh NO_ROLE.
- Body lỗi: code, traceId; remainingAttempts/lockedUntil chỉ có khi phù hợp. Không trả lỗi SQL hoặc nội dung secret.
- Cookie __Host-qtkd-refresh: HttpOnly, Secure, SameSite=Strict, Path=/, không Domain. Secret không trả trong JSON.
- Login/refresh/logout/change-password yêu cầu Origin trong Cors:Origins và X-QTKD-CSRF: 1. Body JSON. Server giới hạn auth 30 request/phút/IP, không hàng đợi; vượt trả 429.
- Chỉ thêm permission đã có trong catalog. Role catalog tám mã cố định. QTHT không có wildcard bỏ qua scope/assignee.
- API không tự migrate/seed. OpenAPI JSON và Swagger UI có trong môi trường `Development`, xem [hướng dẫn Swagger và SMTP](../../../backend/README.md#swagger-và-email-otp).

## Xác thực và phiên

| Method | Endpoint | Dữ liệu / kết quả | Điều kiện |
| --- | --- | --- | --- |
| POST | /auth/login | identifier, password, remember → accessToken, accessTokenExpiresAt, user, signedInAt, previousLogin, idleExpiresAt, expiresAt | Anonymous + Origin/CSRF + rate limit |
| GET | /auth/session | status=active, user hiện hành, signedInAt và thời hạn | JWT và session DB hợp lệ; không gia hạn idle |
| POST | /auth/activity | Body {} → session hiện hành và idleExpiresAt mới | JWT/session; gia hạn tối đa tới giới hạn tuyệt đối |
| POST | /auth/refresh | Body {} → kết quả auth mới và xoay cookie | Cookie refresh hiện hành + Origin/CSRF; không gia hạn idle |
| POST | /auth/logout | Body {} → 204, thu hồi phiên có proof logout và xóa cookie | Origin/CSRF; gọi lặp an toàn, không cần JWT còn hạn |
| POST | /auth/password/change | currentPassword, newPassword → kết quả auth mới và passwordChangedAt | JWT + cookie cùng phiên + Origin/CSRF; giữ phiên hiện tại, thu hồi phiên khác |

user gồm id, username, email, fullName, department (mã), roles, permissions, mustChangePassword, passwordChangedAt và status.
signedInAt là thời điểm phiên được tạo, không phải token để xác thực.
Password mới tối thiểu 12 ký tự, tối đa 72 byte UTF-8, có hoa/thường/số/ký tự đặc biệt.
Password tạm chỉ vào session/activity/refresh/logout/change-password; endpoint khác trả 403 PASSWORD_CHANGE_REQUIRED.
JWT 10 phút, clock skew 60 giây; idle 30 phút, tuyệt đối 8 giờ. Ghi nhớ chỉ thay đổi persistence cookie.

Sai credential trả 401 INVALID_CREDENTIALS chung, không hiển thị số lần còn lại cho login HTTP.
Đang khóa và đã xác minh đúng mật khẩu: 423 LOCKED kèm lockedUntil; disabled: 403 DISABLED.
Đổi mật khẩu sai hiện tại: 400 WRONG_CURRENT, tới lần 5: 400 LOCKED và thu hồi phiên.
Phiên kết thúc có code expired/password-changed/locked/disabled/permissions-changed. Token hỏng trả SESSION_ENDED.

## Quên mật khẩu

Các request gửi JSON và cần `X-QTKD-CSRF: 1` cùng Origin trong danh sách cho phép. FE gửi qua luồng HTTP công khai.

| Method | Endpoint dưới `/api/v1/auth/password/recovery` | Dữ liệu | Kết quả |
| --- | --- | --- | --- |
| POST | `/send` | `identifier` | `202` với `expiresAt`, `resendAvailableAt` theo epoch milliseconds. Phản hồi có cùng cấu trúc dù tài khoản có tồn tại hay không. |
| POST | `/verify` | `identifier`, `code` | `200` với `resetToken`, `accountLabel`. Mã sai, hết hạn, đã dùng hoặc bị chặn đều trả `400 INVALID_CODE`. |
| POST | `/reset` | `resetToken`, `newPassword` | `200` với `identifier` để quay lại login. Lỗi `400 TOKEN_EXPIRED`, `WEAK_PASSWORD` hoặc `SAME_AS_CURRENT`. |

- OTP sáu chữ số có hiệu lực 5 phút. Mỗi tài khoản đợi ít nhất 60 giây giữa hai lần gửi và nhận tối đa 4 mã trong 15 phút. Sau 5 lần xác minh sai, luồng gửi mã của tài khoản tạm dừng 15 phút.
- Xác minh thành công tiêu thụ OTP và cấp reset token dùng một lần, hạn 10 phút. Khi thực sự phát OTP mới, mã và reset token trước đó mất hiệu lực. Reset thành công lưu mật khẩu mới và thu hồi mọi phiên trong cùng transaction.
- `429 RATE_LIMITED` áp theo IP. `/send` trả `503 EMAIL_FAILED` khi chưa bật SMTP hoặc hàng đợi không nhận thêm yêu cầu. `202` xác nhận đã nhận yêu cầu để xử lý, việc giao thư diễn ra sau đó.

## Người dùng, phòng ban, vai trò và quyền

| Method | Endpoint | Dữ liệu | Permission |
| --- | --- | --- | --- |
| GET | /users | Tối đa 200 tài khoản, không hash mật khẩu | users.manage |
| GET | /users/{id} | Chi tiết tài khoản, có status, không hash mật khẩu | users.manage |
| POST | /users | username, email, fullName, departmentId, role (mã FE), password → 201; mustChangePassword=true | users.manage |
| PUT | /users/{id} | fullName, departmentId, role, status (Active/Disabled) | users.manage |
| GET | /departments | departmentId, code, departmentName, managerId | users.manage |
| POST | /departments | code, name | departments.manage |
| PUT | /departments/{id} | code bất biến, name | departments.manage |
| GET | /roles | code, name, department, permissions | roles.manage |
| PUT | /roles/{code}/permissions | permissions: string[]; thay toàn bộ grants của role | roles.manage |
| GET | /permissions | Mã permission catalog | roles.manage |

Cấp user thiếu role/role không hợp lệ hoặc role không thuộc phòng ban: 400.
Username dùng chữ thường a-z, số, dấu ._-; email chuẩn hóa lowercase và unique.
Không xóa user/department/role qua API để giữ tham chiếu lịch sử.
Thay role/phòng ban/status thu hồi session user; thay grants được kiểm tra lại mỗi request.
Chặn tự thay role/phòng ban/status của mình, admin cuối và bỏ quyền admin thiết yếu: 409.
Lookup department/role cho màn quản trị hiện dành cho QTHT có bộ quyền đầy đủ; chưa thiết kế UI quản trị TASK-025.

## Ánh xạ role

| DB | FE | Phòng ban |
| --- | --- | --- |
| SalesStaff | NV_KD | KD |
| SalesManager | TP_KD | KD |
| OperationsStaff | NV_KT | KT |
| OperationsManager | TP_KT | KT |
| Accountant | NV_KTOAN | KTOAN |
| LegalStaff | NV_PC | PC |
| BoardMember | GD | BGD |
| SystemAdmin | QTHT | QTHT |

Ma trận grants khởi tạo nằm trong migration 202611020003_identity (backend/src/QTKD.Infrastructure/Persistence/Migrations/Sql) và bảng role_permission của fixture demo-seed.json.
Sau khi admin thay grants, DB là nguồn quyền; chạy seed không tự phục hồi quyền đã gỡ.

## Tích hợp các module tiếp theo

Policy ResourceAccess nhận resource metadata từ BE đã tải: permission, InScope, OwnerId/AssigneeId nếu cần, StateAllowsAction.
Không bind trực tiếp ResourceAccess từ body client và không mặc định InScope=true khi thiếu AC.
Handler chỉ cung cấp cơ chế; chưa chứng minh endpoint duyệt thật đã tích hợp handler.

`passwordChangedAt` được gộp trong user/session. CRUD UI quản trị còn ngoài phần này.
