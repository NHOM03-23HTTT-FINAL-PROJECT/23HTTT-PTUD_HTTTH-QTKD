# API Nhật ký truy vết (UC-CHUNG-06)

Nguồn: `backend/src/QTKD.Api/Controllers/Audit/AuditLogsController.cs`. Tiền tố `/api/v1`, JWT Bearer. Các thao tác ghi phải có `X-QTKD-CSRF: 1` và `Origin` hợp lệ, thiếu thì trả 403 `CSRF_REJECTED`.

| Method | Endpoint | UC | Quyền | Ghi chú |
|---|---|---|---|---|
| GET | `/audit-logs?from&to&actorId&entityType&entityId&action&page&pageSize` | Bước 2–6, A1, A3, A4 | `audit.view` | Mới nhất trước. Mỗi lần tra cứu ghi thêm một dòng `audit.search` kèm điều kiện lọc (bước 9). |
| GET | `/audit-logs/options` | Bước 2 | `audit.view` | Giá trị cho dropdown lọc: loại đối tượng, hành động, người thực hiện. |
| GET | `/audit-logs/{id}` | Bước 7–8 | `audit.view` | Chi tiết một dòng và các trường thay đổi. Mỗi lần xem ghi thêm một dòng `audit.view`. |
| POST, PUT, PATCH, DELETE | `/audit-logs`, `/audit-logs/{id}` | E3 | Đã đăng nhập | Luôn trả 405 `AUDIT_IMMUTABLE` và ghi một dòng `audit.mutation-rejected` (method, id). Nhật ký không bị đổi. |

## Tham số lọc (`GET /audit-logs`)

| Tham số | Kiểu | Mặc định | Ghi chú |
|---|---|---|---|
| `from`, `to` | ISO 8601 | 7 ngày gần nhất, tính đến hiện tại | Không ghi múi giờ thì hiểu là UTC. Chỉ có `to` thì `from` = `to` − 7 ngày. Khoảng tối đa 366 ngày (nhóm tự đặt, cần xác nhận). |
| `entityId` | uuid | — | Có `entityId` mà không truyền ngày thì không giới hạn thời gian và không giới hạn khoảng (A1). |
| `actorId` | uuid | — | |
| `entityType` | chuỗi ≤ 100 | — | Giá trị `entity_type` lưu trong nhật ký, ví dụ `Contract`, `ContractApproval`, `ContractApprovalAssignment`, `AuditLog`. |
| `action` | chuỗi ≤ 100 | — | Ví dụ `CONTRACT_SUBMITTED`, `assign`, `reassign`, `audit.search`. |
| `page` | số ≥ 1 | 1 | |
| `pageSize` | 1–100 | 20 | |

## Response

`GET /audit-logs`:

```json
{
  "items": [
    { "id": "…", "actedAt": "2026-11-06T03:00:00Z", "actorId": "…", "actorName": "…", "action": "CONTRACT_SUBMITTED",
      "entityType": "Contract", "entityId": "…", "statusBefore": "Draft", "statusAfter": "Submitted", "ipAddress": "10.0.0.1" }
  ],
  "total": 1, "page": 1, "pageSize": 20,
  "from": "2026-10-30T03:00:00Z", "to": "2026-11-06T03:00:00Z"
}
```

`from` và `to` là khoảng thời gian đã thực sự dùng để tra (với A1 thì là `null`).

`GET /audit-logs/{id}`: các trường giống item ở trên, thêm:
- `note`
- `valueBefore`, `valueAfter`: JSON gốc đã lưu
- `changes`: danh sách `{ field, before, after }`. Thay đổi trạng thái (`status`) luôn đứng đầu; các trường không đổi được bỏ qua.

`GET /audit-logs/options`: `{ "entityTypes": [...], "actions": [...], "actors": [{ "id", "name" }] }`.

## Mã lỗi

| Status | `code` | Khi nào |
|---|---|---|
| 400 | `VALIDATION` | E2. Body `{ code, field, reason }`. `reason` là một trong `INVALID_DATE`, `RANGE_INVERTED`, `RANGE_TOO_LONG`, `INVALID_ID`, `TOO_LONG`, `OUT_OF_RANGE`. |
| 401 | — | Chưa đăng nhập. |
| 403 | — / `CSRF_REJECTED` | E1: không có quyền `audit.view`. Hoặc thao tác ghi thiếu header CSRF. |
| 404 | `NOT_FOUND` | Không có dòng nhật ký với `id` đó. |
| 405 | `AUDIT_IMMUTABLE` | E3. |
| 500 | `SYSTEM_ERROR` | E4: lỗi truy vấn. FE hiển thị "Không tải được nhật ký" kèm nút "Tải lại". |
