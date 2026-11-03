# API Hợp đồng và phê duyệt (SYS-CTR-01 → 11)

Nguồn: `frontend/src/features/contracts/api/contractsApi.ts`, `workflowApi.ts` và `frontend/src/mocks/contractsServer.ts`, `workflowServer.ts`. Quy ước chung (tiền tố, JWT, Idempotency-Key, mã lỗi) xem [list_api.md](../../../list_api.md).

Trạng thái 03/11/2026:

| Phần | BE | FE |
|---|---|---|
| Rà soát, phê duyệt SYS-CTR-07 → 09 | Đã có (`ContractApprovalEndpoints.cs`) | `approvalApi.ts` gọi BE |
| Cấu hình người tham gia SYS-CTR-10 | Đã có (`WorkflowConfigEndpoints.cs`) | `workflowApi.ts` còn dùng mock |
| Hồ sơ SYS-CTR-01 → 06, tiến độ SYS-CTR-11 | Chưa có | `contractsApi.ts` dùng mock |

> Bảng "Hồ sơ hợp đồng" bên dưới vẫn là đề xuất từ chữ ký hàm FE, chưa được nhóm BE chốt.

## Hồ sơ hợp đồng (SYS-CTR-01 → 06, 11) – đề xuất

| Method | Endpoint | SYS UC | Hàm FE | Ghi chú |
|---|---|---|---|---|
| GET | `/contracts/form-options` | CTR-01/03 | `contractsApi.getFormOptions` | Khách hàng Active, khu vực Active, mẫu, dịch vụ, loại hợp đồng |
| POST | `/contracts` | CTR-01 | `contractsApi.create` | Idempotency-Key; `{draft}`; chỉ lưu Nháp, chưa khởi tạo quy trình; lỗi `CUSTOMER_INACTIVE` / `AREA_INACTIVE` |
| PUT | `/contracts/{code}/attachments` | CTR-01/03 | `contractsApi.setAttachments` | FE đang gửi cả danh sách. Upload thật cần `POST` multipart và `DELETE …/attachments/{id}`; chỗ lưu trữ chưa chốt |
| GET | `/contracts?keyword&status&areaCode&contractType&page&size&view=all\|tracking` | CTR-02 (tracking → CTR-11 A10) | `contractsApi.list` | Trả kèm `scope` = `own \| department \| granted \| assigned` |
| GET | `/contracts/filter-options` | CTR-02 | `contractsApi.getListFilterOptions` | Khu vực, loại hợp đồng, phòng ban phối hợp |
| GET | `/contracts/{code}` | CTR-06 (dùng chung cho 03, 11) | `contractsApi.getDetail` / `getContract` | Ẩn ý kiến nội bộ Pháp chế với người ngoài Pháp chế (CTR-11 A9) |
| PUT | `/contracts/{code}` | CTR-03 | `contractsApi.update` | `{baseVersion, draft}`; chỉ người phụ trách, chỉ khi Nháp hoặc Yêu cầu chỉnh sửa; trạng thái giữ nguyên |
| GET | `/contracts/{code}/submit-check` | CTR-04 b3–5 | `contractsApi.checkSubmit` | → `{salesReviewer, configLabel, resubmit}`; lỗi `MISSING` (kèm `items`) / `AREA_INACTIVE` / `NO_APPROVER` |
| POST | `/contracts/{code}/submit` | CTR-04 | `contractsApi.submit` | Idempotency-Key; tạo lượt duyệt theo snapshot cấu hình đang áp dụng, giao bước đầu cho Trưởng phòng KD; submit lặp không tạo lượt trùng |
| POST | `/contracts/{code}/cancel` | CTR-05 | `contractsApi.cancel` | `{reason}`; chỉ người phụ trách, chỉ hồ sơ Nháp |

SYS-CTR-11 (tiến độ, lịch sử phê duyệt) hiện dùng chung `GET /contracts/{code}`. Nếu muốn tách quyền xem lịch sử, có thể thêm `GET /contracts/{code}/approval-history`.

## Rà soát và phê duyệt (SYS-CTR-07 → 09) – đã có ở BE

Tiền tố `/api/v1/approvals`, cần đăng nhập. `{id}` là `contract_id` (UUID), `step` là `sales | legal | board`. Route ghi cần `X-QTKD-CSRF: 1`, Origin hợp lệ và header `Idempotency-Key` (trừ `assignment` và `coordination`). BE kiểm tra vai trò, quyền, phạm vi phòng ban, assignee, thứ tự bước và phiên bản hồ sơ trong transaction.

| Method | Endpoint | SYS UC | Hàm FE (`approvalApi`) | Body / ghi chú |
|---|---|---|---|---|
| GET | `/inbox?step=&done=` | CTR-07/08/09 | `inbox` | Hồ sơ chờ xử lý (`done=false`) hoặc đã xử lý theo bước của người gọi |
| GET | `/contracts/{id}?step=` | CTR-07/08/09 | `read` | Hồ sơ kèm lượt duyệt hiện tại; chỉ người được giao trong phạm vi |
| POST | `/contracts/{id}/accept` | CTR-07 b5–6 | `accept` | `{roundId, stepId, viewedVersion, step}`; Submitted → Under Review |
| POST | `/contracts/{id}/decisions` | CTR-07/08/09 | `decide` | `{roundId, stepId, viewedVersion, step, decision: approve \| revision \| reject, comment}`; `comment` bắt buộc, tối đa 4000 ký tự |
| POST | `/contracts/{id}/handoff` | CTR-08 → 09 | `handoff` | `{roundId, stepId, viewedVersion, step}`; Pháp chế trình hồ sơ lên Ban Giám đốc sau khi chấp thuận |
| POST | `/contracts/{id}/assignment` | CTR-08 A4 | — | Quyền `workflows.manage`; `{roundId, stepId, viewedVersion, assigneeId}`; chỉ giao cho bước đang chờ phân công, giao một lần |
| POST | `/contracts/{id}/pending-task/retry?step=` | CTR-07 → 09 | `retryPendingTask` | Gửi lại thông báo đang chờ; không chạy lại quyết định |
| GET | `/coordination-inbox` | CTR-08 A1 | `coordinationInbox` | Yêu cầu phối hợp gửi tới phòng ban của người gọi |
| GET | `/contracts/{id}/coordination` | CTR-08 A1 | `coordination` | Yêu cầu phối hợp của hồ sơ |
| POST | `/contracts/{id}/coordination` | CTR-08 A1.2 | `requestCoordination` | `{expected: {roundId, stepId, viewedVersion, step}, department, content}` |
| POST | `/contracts/{id}/coordination/{coordinationId}/reply` | CTR-08 A1.3–4 | `replyCoordination` | `{reply}` |

Kết quả ghi: `{document, pendingTask}`. Mã lỗi: 400 `VALIDATION` / `IDEMPOTENCY_KEY_REQUIRED` / `INVALID_ASSIGNEE`; 403 `FORBIDDEN` / `NOT_ASSIGNEE` / `CSRF_REJECTED`; 404 `NOT_FOUND`; 409 `STEP_DONE` / `STEP_NOT_READY` / `VERSION_MISMATCH` / `IDEMPOTENCY_CONFLICT` / `ASSIGNMENT_IMMUTABLE` / `WORKFLOW_SNAPSHOT_MISSING` / `WORKFLOW_CONFIGURATION_INVALID`.

Thông báo trong ứng dụng: `GET /api/v1/notifications` (100 thông báo mới nhất của người gọi).

## Cấu hình người tham gia (SYS-CTR-10) – đã có ở BE

Tiền tố `/api/v1`, mọi route yêu cầu quyền `workflows.manage`; route POST cần `X-QTKD-CSRF: 1` và Origin hợp lệ. Dữ liệu lưu ở bảng `workflow_config` (xem [DB/README.md](../../../DB/README.md)). FE (`workflowApi.ts`) còn dùng mock; khi nối BE cần đổi `scope` từ tên phòng ban sang mã phòng ban, người tham gia sang `user_id`, và tách `workflowApi.activate` thành 2 route tạo mới / cập nhật.

| Method | Endpoint | Hàm FE | Ghi chú |
|---|---|---|---|
| GET | `/workflow-configs` | `workflowApi.list` | Mỗi loại hồ sơ × phòng ban có quyền `contracts.create` một dòng `{docType, scope, scopeName, config?}` |
| GET | `/workflow-configs/{code}` | `workflowApi.getConfig` | Phiên bản đang áp dụng kèm `history` (A5); 404 `NOT_FOUND` |
| GET | `/workflow-configs/participants` | `workflowApi.getPeople` | `{people[{id,name,title,departmentCode,department,active,canSign}], scopes, departments}` |
| POST | `/workflow-configs/check` | (mới) | `{draft, code?}` → `{valid, errors, duplicateScope}`; bước 6–7, không ghi |
| POST | `/workflow-configs` | `workflowApi.activate` (tạo mới) | Idempotency-Key; `{draft, replaceExisting?}`; lỗi `DUPLICATE_SCOPE` (E3) |
| POST | `/workflow-configs/{code}/versions` | `workflowApi.activate` (cập nhật, A1) | Idempotency-Key; `{baseVersion, draft}`; lỗi `CONFLICT` (E4). Mỗi lần lưu tạo phiên bản mới, lượt duyệt đang chạy giữ snapshot cũ |

`draft` = `{name, docType, scope, stages[]}`; `scope` là mã phòng ban (VD `KD`), người tham gia là `user_id`. `stages` phải đúng thứ tự `draft → sales → legal → board → signing`; phụ lục thêm `dept-confirm` sau `sales` (được tắt). Lỗi chung: 400 `VALIDATION` kèm `errors {name?, docType?, scope?, stages{<key>: lỗi}}`, 400 `IDEMPOTENCY_KEY_REQUIRED`, 403 `FORBIDDEN`/`CSRF_REJECTED`, 409 `IDEMPOTENCY_KEY_REUSED`. Gửi lại cùng key và cùng nội dung trả `{config, replayed: true}`.
