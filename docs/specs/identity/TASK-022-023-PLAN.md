# TASK-022/023 — kế hoạch và bằng chứng

Phase 0 được người dùng chốt ngày 02/11/2026. Nguồn yêu cầu: Sprint Backlog A27:F28, PB-02. Các ADR 0001–0003 ghi quyết định; trạng thái triển khai độc lập với trạng thái Accepted của ADR.

| Phase | Đầu ra | Trạng thái |
| --- | --- | --- |
| 0 | ADR, API contract, permission matrix, test plan | Đã chốt và ghi ADR/API contract |
| 1 | Bốn project .NET, DI, JWT pipeline, integration test host | Theo bàn giao: build riêng API và dependency PASS; chưa có suite integration PASS |
| 2 | Migration bổ sung Identity/RBAC, seed và kiểm tra tương thích | DB check PASS trên Node 26.13.0: validate/generate/typecheck, 22 tests, dry-run và DDL tĩnh; chưa replay/seed hai lần trên PostgreSQL test riêng |
| 3 | Login, bcrypt, lockout, đổi mật khẩu tạm | Theo bàn giao: người dùng đã đăng nhập thật thành công; bcrypt interop bị abort do testhost không kết nối sau 90 giây; chưa có suite integration PASS |
| 4 | Refresh, idle/absolute expiry, logout, thu hồi phiên | FE suite 15/15 PASS (HTTP/session và hồi quy route); chưa xác nhận đầy đủ server/race trên PostgreSQL |
| 5 | Users/departments/roles/permissions và policies | Có code và test case; ma trận đối chiếu offline đạt; chưa kiểm chứng endpoint thực |
| 6 | FE HTTP auth, bỏ NO_ROLE, test và bàn giao | Đã chặn 26 route nghiệp vụ mock trong API mode sau kiểm tra quyền; typecheck/build và 15/15 FE tests PASS; QA trình duyệt fullstack còn chờ |

## Phụ thuộc và phạm vi

Khung BE cần cho Identity phối hợp TASK-049; sửa FE đăng nhập/đăng xuất phối hợp TASK-025. Không thực hiện workflow engine, chức năng nghiệp vụ khác, deploy hay thay đổi DB dùng chung. Giữ nguyên các migration đã tồn tại. Tài liệu context cũ mô tả bộ khung, không phản ánh tiến độ mới.

## Ranh giới auth thật và nghiệp vụ mock — cập nhật 02/11/2026

API mode: các màn Khách hàng, Khu vực, Hợp đồng, Phê duyệt và cấu hình Workflow chưa có API chỉ hiển thị thông báo chức năng chưa sẵn sàng. BusinessRoute kiểm tra permission trước, không mount màn mock với UUID thật. Không ánh xạ tài khoản thật sang seed prototype. Auth/session/activity/logout vẫn qua BE; 403 giữ phiên, BE báo phiên kết thúc vẫn được xử lý. Mock mode giữ nguyên các màn prototype và kiểm tra quyền/phiên mock.

Kiểm chứng mới: 26 route gồm danh sách, tạo/sửa, chi tiết, phê duyệt và workflow được render tĩnh trong test; HTTP được giả lập cho auth adapter. Đây không phải QA trình duyệt hoặc integration BE/PostgreSQL. TASK-022/023 chưa hoàn tất.

## Môi trường và giới hạn ban đầu (lịch sử)

SDK 10.0.403, runtime 10.0.14 đã có. Network trong shell hiện không phân giải api.nuget.org. Cache có EF/Npgsql, chưa có toàn bộ thư viện auth/test. Supabase MCP thấy QTKD_DATH có 26 bảng và lịch sử Prisma; đó không phải project test độc lập, chỉ kiểm tra metadata đọc. Không tự apply migration mới vào project này.

Kết quả kiểm thử và trạng thái cuối được cập nhật sau các lệnh thực chạy, xem ../../testing/test-cases/identity.md.

## Điểm review tiếp theo

Chạy integration suite BE (chưa có kết quả PASS), gồm bcrypt interop; cấu hình Supabase test riêng để replay migration, seed hai lần và kiểm tra RLS/enum/concurrency. QA trình duyệt fullstack cần xác nhận chuyển trang, thiếu quyền, hết hạn/thu hồi phiên và logout. FE typecheck/build và 15 tests đã PASS trong lượt sửa ranh giới mock/API; DB offline check 22 tests đã PASS ở lượt trước. Chỉ khi các gate còn lại đạt mới đề nghị nghiệm thu TASK-022/023.

Hướng dẫn team sau khi pull: [README gốc](../../../README.md) và [LOCAL-FULLSTACK.md](../../setup/LOCAL-FULLSTACK.md). .env chia sẻ qua kênh bảo mật riêng, CA cần chỉnh theo máy. Theo bàn giao, người dùng đã chạy đăng nhập thật. Launcher chưa chuyển sslrootcert sang Npgsql; nếu cần CA riêng, đặt PGSSLROOTCERT bằng path tuyệt đối. Lượt cập nhật tài liệu đã PASS test parser launcher; không thay runtime hoặc dữ liệu DB và không đánh dấu task hoàn tất.
