# Quyết định kỹ thuật

Mỗi quyết định ghi một file `NNNN-ten-quyet-dinh.md` gồm: bối cảnh, phương án, quyết định, ngày chốt, người chốt.

## Identity — đã chốt Phase 0 ngày 02/11/2026

- [0001: một role bắt buộc](0001-identity-single-role.md).
- [0002: Identity Core, nguồn schema và phân quyền](0002-identity-storage-and-permissions.md).
- [0003: JWT, refresh và logout](0003-session-jwt-and-logout.md).

Accepted là trạng thái quyết định. Trạng thái code/test nằm trong [plan](../specs/identity/TASK-022-023-PLAN.md). Với Identity: .NET 10, Identity Core/custom store, JWT và Prisma quản lý migration đã chốt; không nằm trong danh sách cần chọn lại. Application hiện dùng interface dịch vụ IIdentityService. Bản tổng hợp tác động kỹ thuật: [changelog](../specs/identity/CHANGELOG.md).

## Cần chốt

Lấy từ [context/PROJECT.md](../../context/PROJECT.md) và bộ khung thư mục:

- Git hosting: GitLab (PDF) hay GitHub (kế hoạch); CI tương ứng.
- Chuẩn hóa toolchain chung toàn team; SDK/backend và dependency Identity đã được pin trong source, Node 24 LTS là hướng dẫn local hiện tại.
- Nơi lưu tệp đính kèm và cách tích hợp API nghiệp vụ, chưa thuộc Identity.
- Quy ước Application cho module tiếp theo nếu nhóm muốn thay cách dùng services hiện tại; không tự chuyển Identity sang framework/engine khác.
- Quy ước nhánh, Pull Request, Definition of Done (TASK-001).
