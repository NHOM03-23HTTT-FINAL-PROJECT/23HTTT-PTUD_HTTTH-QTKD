# Danh sách API Sprint 1

Cập nhật 03/11/2026. Endpoint BE nằm trong `backend/src/QTKD.Api` (`Program.cs` và `Endpoints/`).

| Phần | Trạng thái BE |
|---|---|
| Xác thực, người dùng, phòng ban, vai trò, quyền (TASK-022/023) | Đã có theo [hợp đồng API đã chốt](docs/specs/identity/list_api-auth.md); [plan](docs/specs/identity/TASK-022-023-PLAN.md) ghi trạng thái kiểm chứng |
| Rà soát, phê duyệt hợp đồng SYS-CTR-07 → 09 và thông báo | Đã có, xem [list_api-contract.md](docs/specs/contracts/list_api-contract.md) |
| Phân công người duyệt SYS-CTR-10 | Đã có; FE đã nối (tab "Phân công người duyệt") |
| Khách hàng, khu vực, hồ sơ hợp đồng SYS-CTR-01 → 06, tiến độ SYS-CTR-11 | Chưa có; endpoint là đề xuất từ lớp API FE (`frontend/src/features/*/api/*.ts`) và mock (`frontend/src/mocks/*Server.ts`) |

> Endpoint ghi "đề xuất" được suy ra từ chữ ký hàm FE, chưa đối chiếu đặc tả UC chi tiết và chưa được nhóm BE chốt.

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
- **CSRF:** request ghi gửi `X-QTKD-CSRF: 1` từ Origin nằm trong `Cors:Origins`; sai trả 403 `CSRF_REJECTED`.
- **Chống tạo trùng:** thao tác có `idempotencyKey` gửi qua header `Idempotency-Key`; thiếu key trả 400 `IDEMPOTENCY_KEY_REQUIRED`, dùng lại key với nội dung khác trả 409 `IDEMPOTENCY_CONFLICT`; gửi lại đúng nội dung trả kết quả cũ (`replayed`).
- **Ghi đè đồng thời:** `baseVersion` / `viewedVersion` đi trong body; lệch phiên bản trả 409.
- **Dạng lỗi:** `{code, traceId}`.
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
