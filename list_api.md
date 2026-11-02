# Danh sách API Sprint 1 (đề xuất)

Cập nhật 02/11/2026: Identity TASK-022/023 đã có source theo [hợp đồng API đã chốt](docs/specs/identity/list_api-auth.md); [plan](docs/specs/identity/TASK-022-023-PLAN.md) ghi trạng thái kiểm chứng. Các module khác bên dưới vẫn là đề xuất từ FE/mock.

Nguồn: lớp API ở FE (`frontend/src/features/*/api/*.ts`) và mock server (`frontend/src/mocks/*Server.ts`). `backend/` chưa có controller nên mỗi hàm FE được ánh xạ sang một endpoint đề xuất.

> Tên endpoint và mã HTTP là đề xuất từ chữ ký hàm, chưa đối chiếu đặc tả UC chi tiết và chưa được nhóm BE chốt.

## Danh sách theo module

| Module | UC | File |
|---|---|---|
| Xác thực | UC-CHUNG-01 → 04 | [list_api-auth.md](docs/specs/identity/list_api-auth.md) |
| Khách hàng | UC-CUS-01 → 06 | [list_api-customer.md](docs/specs/customers/list_api-customer.md) |
| Khu vực | UC-ARE-01, 02, 04, 12, 13 | [list_api-area.md](docs/specs/areas/list_api-area.md) |
| Hợp đồng và phê duyệt | SYS-CTR-01 → 11 | [list_api-contract.md](docs/specs/contracts/list_api-contract.md) |

## Quy ước chung

- **Tiền tố:** `/api/v1`.
- **Xác thực:** `Authorization: Bearer <JWT>` thay cho cặp `userId` + `signedInAt` mà mock FE đang dùng. BE tự kiểm tra phiên; phiên hết hạn hoặc bị thu hồi trả 401 kèm lý do (`expired`, `password-changed`, `locked`, `disabled`, `permissions-changed`). Role lỗi do data/config trong login trả SYSTEM_ERROR và không tạo phiên; role hợp lệ thiếu quyền thao tác trả 403.
- **Chống tạo trùng:** thao tác có `idempotencyKey` gửi qua header `Idempotency-Key`; kết quả trả về `replayed`.
- **Ghi đè đồng thời:** `baseVersion` / `viewedVersion` đi trong body; lệch phiên bản trả 409.
- **Mã lỗi → HTTP:**
  - `VALIDATION` → 400/422
  - `SESSION_ENDED` → 401
  - `FORBIDDEN`, `NOT_OWNER`, `NOT_ASSIGNEE` → 403
  - `NOT_FOUND` → 404
  - `CONFLICT`, `DUPLICATE_*`, `STATUS`, `STEP_NOT_READY`, `STEP_DONE`, `VERSION_MISMATCH`, `NO_CHANGES` → 409
- **Không đưa vào API:** tham số `retry` (chỉ để mock giả lập lỗi) và `devCode` của OTP (chỉ có trong prototype).

## Những phần chưa có trong code

- **Chưa có FE:** quản lý người dùng, phòng ban, vai trò, quyền (TASK-021..028); audit log; danh mục dùng chung. Các thư mục `audit-logs/`, `catalogs/`, `users/` mới chỉ có `.gitkeep`.
- **Dashboard và chuông thông báo** đang đọc thẳng từ `mocks/seed/dashboards.ts`, chưa qua lớp API.
