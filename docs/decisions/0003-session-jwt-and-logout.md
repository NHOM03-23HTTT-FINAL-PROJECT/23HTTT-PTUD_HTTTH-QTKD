# ADR 0003: JWT, refresh và thu hồi phiên

- Trạng thái: Accepted
- Ngày chốt: 2026-11-02
- Người chốt: người giao TASK-022/023, chấp thuận các phương án Phase 0.

## Quyết định

JWT có sub/sid/jti/iat/exp/iss/aud; chỉ chấp nhận HS256, khóa tối thiểu 32 byte từ cấu hình riêng; không commit khóa. JWT 10 phút, clock skew 60 giây. Phiên tuyệt đối 8 giờ, idle 30 phút; luôn kiểm tra phiên DB sau khi xác minh JWT. Không lưu JWT/refresh token trong Web Storage.

Cookie chứa hai secret ngẫu nhiên 32 byte: secret ổn định chỉ chứng minh quyền logout và secret refresh được xoay. DB chỉ giữ SHA-256 của toàn cookie và SHA-256 logout secret; không giữ secret rõ. Cookie HttpOnly, Secure, SameSite=Strict. Ghi nhớ chỉ tạo cookie persistent tới giới hạn tuyệt đối, không bỏ idle timeout. FE chạy cùng origin qua Vite proxy hoặc reverse proxy HTTPS. Cookie endpoints yêu cầu Origin trong allowlist và header X-QTKD-CSRF: 1 (JSON); không coi CORS là biện pháp CSRF duy nhất.

Chi tiết triển khai bổ sung: logout secret ổn định để logout vẫn thu hồi được phiên nếu một refresh đồng thời đã xoay hash trước đó. Secret này không được phép refresh hoặc phát JWT. Chỉ kiểm tra hash refresh hiện hành để refresh; không chấp nhận cookie cũ để refresh. Có test tái hiện thứ tự refresh-then-logout bằng cookie cũ.

Refresh xoay hash bằng transaction/row lock; token cũ không dùng lại được. MVP1 từ chối token cũ; chưa có lịch sử token family để phát hiện và thu hồi toàn family khi reuse. FE serialize refresh giữa các tab khi Web Locks có sẵn.

Logout xác minh refresh cookie, thu hồi phiên đó và xóa cookie, gọi lặp không ghi trùng. Lỗi mạng chỉ đảm bảo xóa trạng thái cục bộ; không báo đã thu hồi server. Đổi mật khẩu giữ phiên hiện tại (xoay refresh), thu hồi phiên khác. Đổi role/phòng ban/status thu hồi phiên người dùng. Kiểm tra phiên/refresh nền không gia hạn idle; FE gửi activity có throttle khi có tương tác, server quyết định thời gian.

FE lưu cờ boolean đã logout (không phải credential) để không tự restore cookie sau lỗi mạng. Cờ được gỡ khi đăng nhập chủ động. Phản hồi refresh cũ không được khôi phục token sau logout; các request mới không được tự refresh trong thời gian đã logout.

Mật khẩu tạm chỉ được gọi session/activity/logout/refresh/change-password. API nghiệp vụ và quản trị trả 403 PASSWORD_CHANGE_REQUIRED. Sai mật khẩu 5 lần khóa 15 phút; login username/email dùng chung bộ đếm. Tài khoản không tồn tại nhận INVALID_CREDENTIALS chung. Rate limit theo IP hạn chế thử hàng loạt.

## Kiểm chứng

JWT giả/sai issuer/audience/hết hạn => 401. Thiếu quyền => 403. Logout làm JWT còn hạn mất hiệu lực ngay. Phiên khác không bị ảnh hưởng. Refresh/logout và đổi mật khẩu xử lý tuần tự cùng tài khoản. Token, mật khẩu, cookie không xuất hiện trong log.
