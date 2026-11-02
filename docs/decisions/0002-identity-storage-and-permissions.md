# ADR 0002: Identity Core, PostgreSQL và nguồn quyền

- Trạng thái: Accepted
- Ngày chốt: 2026-11-02
- Người chốt: người giao TASK-022/023, chấp thuận các phương án Phase 0.

## Bối cảnh

Backend chưa có project. DB có schema qtkd và seed bcrypt. Prisma đã quản lý migration. Dùng Identity mặc định sẽ tạo một schema tài khoản khác; MapIdentityApi phát token riêng không đáp ứng JWT chuẩn.

## Quyết định

- .NET 10; bốn tầng Api/Application/Domain/Infrastructure. Application dùng interface dịch vụ, Infrastructure triển khai Identity Core custom store và EF Core/Npgsql; Domain không phụ thuộc HTTP/EF.
- Dùng bcrypt cost 12 tương thích bcryptjs; tối đa 72 byte UTF-8 và tối thiểu 12 ký tự khi tạo/đổi mật khẩu. Không thay hash seed hoặc dùng PasswordHasher mặc định để xác minh bcrypt.
- Supabase cung cấp PostgreSQL, không tự tích hợp Supabase Auth.
- Prisma là nguồn migration duy nhất. EF không chạy Migrate/EnsureCreated trong ứng dụng. Migration mới bổ sung role_definition, permission, role_permission, mã phòng ban, thông tin phiên và thời điểm đổi mật khẩu; không sửa migration đã áp dụng.
- Tám mã role cố định theo dictionary; QTHT gán role cho user và quản lý grants giữa role/permission. Role thuộc phòng ban hợp lệ. Permission catalog có mã ổn định tương thích FE.
- Permission được đọc từ DB mỗi request; JWT không phải nguồn quyền hiện hành. Không cấp wildcard cho QTHT; handler tài nguyên còn kiểm tra phạm vi, owner/assignee và trạng thái theo module sở hữu.
- Quản trị không tự vô hiệu hóa/đổi role của chính mình; không được bỏ grants quản trị thiết yếu của SystemAdmin. Đây là giới hạn để tránh mất khả năng quản trị trong MVP1.

## Hệ quả

Phụ thuộc TASK-049 cho nền BE; chỉ dựng phần cần chạy Identity. Phạm vi nhìn thấy khách hàng/hợp đồng chưa đủ AC: cung cấp abstraction kiểm tra tài nguyên, không tự mở quyền xem toàn bộ hay triển khai workflow. Test dùng JWT middleware thật. PostgreSQL dùng môi trường test riêng; không ghi DB chung từ các lệnh kiểm thử.

## Nguồn kỹ thuật

- https://learn.microsoft.com/aspnet/core/security/authentication/identity-custom-storage-providers?view=aspnetcore-10.0
- https://www.npgsql.org/efcore/mapping/enum.html
