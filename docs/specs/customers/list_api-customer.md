# API Khách hàng (UC-CUS-01 → 06)

Nguồn: `frontend/src/features/customers/api/customersApi.ts`, `customerRecordsApi.ts`, `customerStatusApi.ts` và các mock server tương ứng trong `frontend/src/mocks/`. Quy ước chung (tiền tố, JWT, Idempotency-Key, mã lỗi) xem [list_api.md](../../../list_api.md).

> Endpoint là đề xuất từ chữ ký hàm FE, chưa đối chiếu đặc tả UC chi tiết và chưa được nhóm BE chốt.

| Method | Endpoint | UC | Hàm FE | Ghi chú |
|---|---|---|---|---|
| GET | `/customers?keyword&status&sort&page&size` | CUS-05 | `customersApi.search` | Chỉ đếm và trả bản ghi trong phạm vi quyền |
| GET | `/customers/{code}` | CUS-06 | `customersApi.getCustomer` | |
| GET | `/customers/form-options` | CUS-01/02 | `customersApi.getFormOptions` | Nhóm khách hàng, nhóm dịch vụ |
| POST | `/customers` | CUS-01 | `customersApi.create` | Idempotency-Key; `{draft}`; lỗi `DUPLICATE_TAX_CODE` |
| PATCH | `/customers/{code}` | CUS-02 | `customersApi.update` | Idempotency-Key; `{baseVersion, draft, reason}`; gửi kèm mã KH/MST/trạng thái/người phụ trách thì báo `IMMUTABLE_FIELD` |
| GET | `/customers/{code}/records/{group}` | CUS-06 | `customerRecordsApi.getGroup` | `group` = `contracts \| priceLists \| payments`; mỗi nhóm tải và báo lỗi riêng |
| POST | `/customers/{code}/payments/{paymentCode}/discrepancy-reports` | CUS-06 | `customerRecordsApi.reportDiscrepancy` | `{content}` |
| GET | `/customers/suspension-reason-groups` | CUS-03 | `customerStatusApi.getSuspensionReasonGroups` | |
| GET | `/customers/{code}/suspension-review` | CUS-03 b2 | `customerStatusApi.getSuspensionReview` | Hồ sơ và công việc bị ảnh hưởng |
| POST | `/customers/{code}/suspend` | CUS-03 | `customerStatusApi.suspend` | Idempotency-Key; `{baseVersion, reasonGroup, reason, evidence, plan, coordinationNote}`; chỉ Trưởng phòng KD |
| GET | `/customers/{code}/reactivation-context` | CUS-04 | `customerStatusApi.getReactivationContext` | Thông tin tạm ngưng hiện hành và điều kiện kích hoạt lại |
| POST | `/customers/{code}/reactivate` | CUS-04 | `customerStatusApi.reactivate` | Idempotency-Key; `{baseVersion, reason, evidence, exception?}`; chỉ Trưởng phòng KD |

## Phụ thuộc module Sprint 2/3

Nhóm `priceLists` / `payments` và báo cáo sai lệch thanh toán phụ thuộc module Bảng giá, Thanh toán. Nên giữ endpoint nhưng trả rỗng ở Sprint 1.
