# API Khu vực (UC-ARE-01, 02, 04, 12, 13)

Nguồn: `frontend/src/features/areas/api/areasApi.ts` và `frontend/src/mocks/areasServer.ts`. Quy ước chung (tiền tố, JWT, Idempotency-Key, mã lỗi) xem [list_api.md](../../../list_api.md).

> Endpoint là đề xuất từ chữ ký hàm FE, chưa đối chiếu đặc tả UC chi tiết và chưa được nhóm BE chốt.

| Method | Endpoint | UC | Hàm FE | Ghi chú |
|---|---|---|---|---|
| GET | `/areas?keyword&status&type&parentCode&page[&all=true]` | ARE-12 | `areasApi.search` | `all=true` cho sơ đồ cây, trả kèm `context` là các nút cha |
| GET | `/areas/tree` | ARE-01/02/04/12 | `areasApi.getTree` | Sơ đồ phân cấp hiện hành |
| GET | `/areas/{code}` | ARE-13 | `areasApi.getArea` | |
| POST | `/areas` | ARE-01 | `areasApi.create` | Idempotency-Key; `{draft}`; lỗi `DUPLICATE_CODE` / `DUPLICATE_NAME` / `INVALID_PARENT` |
| PUT | `/areas/{code}` | ARE-04 | `areasApi.update` | Idempotency-Key; `{baseVersion, draft, reason}` |
| GET | `/areas/{code}/references` | ARE-04 b2 | `areasApi.getReferences` | Tham chiếu trong bảng giá, hợp đồng, sản lượng – quyết định khóa mã (ARE-07). FE đang truyền `areaId`, nên thống nhất dùng `code` |
| PUT | `/areas/{code}/parent` | ARE-02 | `areasApi.changeParent` | Idempotency-Key; `{baseVersion, parentCode}` → `area`, `changes` (đường dẫn mới của các phân khu con), `previousParent`; chặn vòng lặp và quá 3 cấp |
| GET | `/areas/{code}/records/{group}` | ARE-13 | `areasApi.getRecords` | `group` = `services \| staff \| priceLists \| contracts` |
| POST | `/areas/{code}/exports` | ARE-13 (13.11) | `areasApi.recordExport` | `{sections}` → tên người xuất; ghi nhật ký |

## Đã có trên trang chi tiết, chưa gắn mã UC Sprint 1 (cần xác nhận phạm vi)

| Method | Endpoint | Hàm FE | Ghi chú |
|---|---|---|---|
| GET | `/areas/operation-catalogs` | `areasApi.getOperationCatalogs` | Nhân viên Khai thác, dịch vụ cảng |
| POST | `/areas/{code}/staff` | `areasApi.assignStaff` | `{staffCode, title, shift, since}`; chỉ Trưởng phòng Khai thác |
| POST | `/areas/{code}/staff/{staffCode}/end` | `areasApi.endStaff` | `{reason}` |
| PUT | `/areas/{code}/services` | `areasApi.setServices` | `{serviceNames, since, reason}` |
| POST | `/areas/{code}/status` | `areasApi.changeStatus` | `{baseVersion, status, reason}` |

## Phụ thuộc module Sprint 2/3

Nhóm `priceLists` phụ thuộc module Bảng giá. Nên giữ endpoint nhưng trả rỗng ở Sprint 1.
