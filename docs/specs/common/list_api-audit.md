# API Nhật ký truy vết (UC-CHUNG-06)

Nguồn: `backend/src/QTKD.Api/Controllers/Audit/AuditLogsController.cs`. Tiền tố `/api/v1`, JWT Bearer. Các thao tác ghi phải có `X-QTKD-CSRF: 1` và `Origin` hợp lệ, thiếu thì trả 403 `CSRF_REJECTED`.

| Method | Endpoint | UC | Quyền | Ghi chú |
|---|---|---|---|---|
| GET | `/audit-logs?from&to&actorId&entityType&entityId&action&page&pageSize` | Bước 2–6, A1, A3, A4 | `audit.view` | Mới nhất trước. Mỗi lần tra cứu ghi thêm một dòng `AUDIT_SEARCHED` kèm điều kiện lọc (bước 9). |
| GET | `/audit-logs/options` | Bước 2 | `audit.view` | Giá trị cho dropdown lọc: loại đối tượng, hành động, người thực hiện. |
| GET | `/audit-logs/{id}` | Bước 7–8 | `audit.view` | Chi tiết một dòng và các trường thay đổi. Mỗi lần xem ghi thêm một dòng `AUDIT_VIEWED`. |
| POST, PUT, PATCH, DELETE | `/audit-logs`, `/audit-logs/{id}` | E3 | Đã đăng nhập | Luôn trả 405 `AUDIT_IMMUTABLE` và ghi một dòng `AUDIT_MUTATION_REJECTED` (method, id). Nhật ký không bị đổi. |

## Tham số lọc (`GET /audit-logs`)

| Tham số | Kiểu | Mặc định | Ghi chú |
|---|---|---|---|
| `from`, `to` | ISO 8601 | 7 ngày gần nhất, tính đến hiện tại | Không ghi múi giờ thì hiểu là UTC. Chỉ có `to` thì `from` = `to` − 7 ngày. Khoảng tối đa 366 ngày (nhóm tự đặt, cần xác nhận). |
| `entityId` | uuid | — | Có `entityId` mà không truyền ngày thì không giới hạn thời gian và không giới hạn khoảng (A1). |
| `actorId` | uuid | — | |
| `entityType` | chuỗi ≤ 100 | — | Giá trị `entity_type` lưu trong nhật ký, ví dụ `Contract`, `ContractApproval`, `ContractApprovalAssignment`, `AuditLog`. |
| `action` | chuỗi ≤ 100 | — | Ví dụ `CONTRACT_SUBMITTED`, `APPROVER_ASSIGNED`, `AUDIT_SEARCHED`. Xem [Danh mục hành động](#danh-mục-hành-động). |
| `page` | số ≥ 1 | 1 | |
| `pageSize` | 1–100 | 20 | |

## Response

`GET /audit-logs`:

```json
{
  "items": [
    { "id": "…", "actedAt": "2026-11-06T03:00:00Z", "actorId": "…", "actorName": "…", "action": "CONTRACT_SUBMITTED",
      "entityType": "Contract", "entityId": "…", "entityCode": "HD-000001", "statusBefore": "Draft", "statusAfter": "Submitted", "ipAddress": "10.0.0.1" }
  ],
  "total": 1, "page": 1, "pageSize": 20,
  "from": "2026-10-30T03:00:00Z", "to": "2026-11-06T03:00:00Z"
}
```

`from` và `to` là khoảng thời gian đã thực sự dùng để tra (với A1 thì là `null`).

`entityCode` là mã hợp đồng hoặc khu vực còn tồn tại (dùng để mở đối tượng liên quan, A2). Bằng `null` khi đối tượng đã mất hoặc thuộc loại khác.

`GET /audit-logs/{id}`: các trường giống item ở trên, thêm:
- `note`
- `valueBefore`, `valueAfter`: JSON gốc đã lưu
- `changes`: danh sách `{ field, before, after }`. Thay đổi trạng thái (`status`) luôn đứng đầu; các trường không đổi được bỏ qua.

`GET /audit-logs/options`: `{ "entityTypes": [...], "actions": [...], "actors": [{ "id", "name" }] }`.

## Hành động đăng nhập và tài khoản (module Identity)

| `action` | Khi nào | `value_after` |
|---|---|---|
| `LOGIN_SUCCESS` | Đăng nhập thành công | `{ device }` |
| `LOGIN_FAILED` | Sai mật khẩu của tài khoản có thật | `{ reason: "wrong-password", failedCount, locked }` |
| `LOGOUT` | Người dùng chủ động đăng xuất | — |
| `PASSWORD_CHANGED` | Đổi mật khẩu khi đang đăng nhập | — |
| `PASSWORD_RESET` | Đặt lại mật khẩu qua OTP | — |

Các hành động này có `entityType = "UserAccount"`, `entityId` và `actorId` là chính người dùng. Không ghi mật khẩu, token hay hash.

Không ghi (cố ý): đăng nhập với tên tài khoản không tồn tại (không có người thực hiện, và dễ lộ mật khẩu gõ nhầm); đăng nhập bị từ chối vì tài khoản bị khóa hoặc vô hiệu; đăng nhập mới thay phiên cũ trong cùng trình duyệt (không phải người dùng đăng xuất); phiên hết hạn.

## Danh mục hành động

Quy ước: `UPPER_SNAKE_CASE`, dạng `<ĐỐI_TƯỢNG>_<ĐỘNG_TỪ_QUÁ_KHỨ>`. Mọi dòng đều do backend ghi trong lúc xử lý request của nghiệp vụ (không có trigger/function ghi nhật ký) và có `ip_address` của người gửi request.

| `entityType` | `action` | Tên cũ (trước khi thống nhất) |
|---|---|---|
| `UserAccount` | `LOGIN_SUCCESS`, `LOGIN_FAILED`, `LOGOUT`, `PASSWORD_CHANGED`, `PASSWORD_RESET` | — |
| `Contract` | `CONTRACT_CREATED`, `CONTRACT_UPDATED`, `CONTRACT_SUBMITTED`, `CONTRACT_CANCELLED`, `CONTRACT_FILE_ADDED`, `CONTRACT_FILE_REMOVED`, `CANCELLATION_REQUESTED`, `CANCELLATION_DECIDED` | — |
| `ContractApproval` | `REVIEW_ACCEPTED`, `REVIEW_HANDED_OFF`, `REVIEW_APPROVED`, `REVIEW_APPROVED_AND_FORWARDED`, `REVIEW_REVISION_REQUESTED`, `REVIEW_REJECTED` | `accept`, `handoff`, `approve`, `revision`, `reject` |
| `ContractApprovalAssignment` | `APPROVER_ASSIGNED`, `APPROVER_REASSIGNED` | `assign`, `reassign` |
| `ContractCoordination` | `COORDINATION_REQUESTED`, `COORDINATION_REPLIED` | `coordination-request`, `coordination-reply` |
| `Area` | `AREA_CREATED`, `AREA_UPDATED`, `AREA_PARENT_CHANGED`, `AREA_STATUS_CHANGED`, `AREA_STAFF_ASSIGNED`, `AREA_STAFF_ENDED`, `AREA_SERVICES_UPDATED` | `CREATE`, `UPDATE`, `CHANGE_PARENT`, `CHANGE_STATUS`, `ASSIGN_STAFF`, `END_STAFF`, `SET_SERVICES` |
| `AuditLog` | `AUDIT_SEARCHED`, `AUDIT_VIEWED`, `AUDIT_MUTATION_REJECTED` | `audit.search`, `audit.view`, `audit.mutation-rejected` |

`audit_log` chỉ ghi thêm, nên các dòng ghi trước khi đổi tên vẫn giữ tên cũ và không có IP (trừ `UserAccount`, `Area`, `AuditLog`). Nơi đọc theo tên (lịch sử khu vực, phối hợp phòng ban) và nhãn trên FE nhận cả hai tên.

## Mã lỗi

| Status | `code` | Khi nào |
|---|---|---|
| 400 | `VALIDATION` | E2. Body `{ code, field, reason }`. `reason` là một trong `INVALID_DATE`, `RANGE_INVERTED`, `RANGE_TOO_LONG`, `INVALID_ID`, `TOO_LONG`, `OUT_OF_RANGE`. |
| 401 | — | Chưa đăng nhập. |
| 403 | — / `CSRF_REJECTED` | E1: không có quyền `audit.view`. Hoặc thao tác ghi thiếu header CSRF. |
| 404 | `NOT_FOUND` | Không có dòng nhật ký với `id` đó. |
| 405 | `AUDIT_IMMUTABLE` | E3. |
| 500 | `SYSTEM_ERROR` | E4: lỗi truy vấn. FE hiển thị "Không tải được nhật ký" kèm nút "Tải lại". |
