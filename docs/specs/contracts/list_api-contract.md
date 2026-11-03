# API Hợp đồng và phê duyệt (SYS-CTR-01 → 11)

Nguồn: `frontend/src/features/contracts/api/contractsApi.ts`, `approvalApi.ts`, `frontend/src/mocks/contractsServer.ts` và `backend/src/QTKD.Api/Endpoints/ContractApprovalEndpoints.cs`. Quy ước chung (tiền tố, JWT, Idempotency-Key, mã lỗi) xem [list_api.md](../../../list_api.md).

> Sau khi ghép main: CRUD hợp đồng (SYS-CTR-01/02/03/05/06), tệp và US-CTR-19 có controller .NET; rà soát/phê duyệt và phân công người duyệt sử dụng implementation từ main. Luồng submit hợp đồng chưa được triển khai trong phần CRUD. Xem [cách chạy và giới hạn](../../../backend/GETTING-STARTED.md).

## Endpoint thực thi bổ sung / điều chỉnh

Mọi endpoint cần Bearer JWT. Lệnh tạo, hủy, tải/xóa tệp và quyết định đề nghị hủy cần `Idempotency-Key`. BE không dùng `userId`/role từ body.

| Method | Endpoint | Body / quy tắc |
|---|---|---|
| POST | `/contracts/{code}/attachments` | multipart `file`, `baseVersion`; tối đa 20 MiB |
| GET | `/contracts/{code}/attachments/{id}` | Download có kiểm tra phạm vi hợp đồng |
| DELETE | `/contracts/{code}/attachments/{id}?baseVersion=` | Xóa liên kết ở Draft/RevisionRequested |
| POST | `/contracts/{code}/cancel` | `{baseVersion, reason}`; hủy nháp trực tiếp |
| POST | `/contracts/{code}/cancellation-requests` | `{baseVersion, party: company\|customer, reason}` |
| POST | `/contracts/{code}/cancellation-requests/{id}/decision` | `{baseVersion, approve, reason}`; version của đề nghị, lý do bắt buộc khi từ chối |

GET chi tiết trả thêm `customerSnapshot`, `history`, `cancellationRequests`. PUT tệp theo toàn bộ danh sách trong bảng đề xuất cũ không được triển khai. Thay bằng các endpoint tệp ở trên. Đợt này chỉ xử lý document_type Contract.
Trạng thái 03/11/2026:

| Phần | BE | FE |
|---|---|---|
| Rà soát, phê duyệt SYS-CTR-07 → 09 | Đã có (`ContractApprovalEndpoints.cs`) | `approvalApi.ts` gọi BE |
| Phân công người duyệt SYS-CTR-10 | Đã có (`ContractApprovalEndpoints.cs`, `ApprovalAssignmentService.cs`) | `approvalApi.ts` gọi BE (tab "Phân công người duyệt") |
| CRUD hồ sơ SYS-CTR-01/02/03/05/06, tệp và US-CTR-19 | Đã có (`ContractsController.cs`) | `contractsApi.ts` gọi BE khi bật `VITE_CONTRACTS_USE_BACKEND` |
| Submit SYS-CTR-04, tiến độ SYS-CTR-11 | Chưa nối hoàn chỉnh | Giữ ranh giới mock/API theo từng route |

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

## Rà soát, phê duyệt và phân công (SYS-CTR-07 → 10) – đã có ở BE

Tiền tố `/api/v1/approvals`, cần đăng nhập. `{id}` là `contract_id` (UUID), `step` là `sales | legal | board`. Route ghi cần `X-QTKD-CSRF: 1`, Origin hợp lệ và header `Idempotency-Key` (trừ `assignment` và `coordination`). BE kiểm tra vai trò, quyền, phạm vi phòng ban, assignee, thứ tự bước và phiên bản hồ sơ trong transaction.

| Method | Endpoint | SYS UC | Hàm FE (`approvalApi`) | Body / ghi chú |
|---|---|---|---|---|
| GET | `/inbox?step=&done=` | CTR-07/08/09 | `inbox` | Hồ sơ chờ xử lý (`done=false`) hoặc đã xử lý theo bước của người gọi |
| GET | `/contracts/{id}?step=` | CTR-07/08/09 | `read` | Hồ sơ kèm lượt duyệt hiện tại; chỉ người được giao trong phạm vi |
| POST | `/contracts/{id}/accept` | CTR-07 b5–6 | `accept` | `{roundId, stepId, viewedVersion, step}`; Submitted → Under Review |
| POST | `/contracts/{id}/decisions` | CTR-07/08/09 | `decide` | `{roundId, stepId, viewedVersion, step, decision: approve \| revision \| reject, comment}`; `comment` bắt buộc, tối đa 4000 ký tự |
| POST | `/contracts/{id}/handoff` | CTR-08 → 09 | `handoff` | `{roundId, stepId, viewedVersion, step}`; Pháp chế trình hồ sơ lên Ban Giám đốc sau khi chấp thuận |
| GET | `/assignments` | CTR-10 | `assignments` | Quyền `approvals.assign` (vai trò SalesManager, LegalManager, BoardChair); hồ sơ đang trong lượt duyệt có bước người gọi phụ trách → `[{document, managedSteps}]` |
| GET | `/contracts/{id}/candidates?step=` | CTR-10 b4 | `candidates` | Quyền `approvals.assign`; người còn hoạt động, đúng vai trò và quyền duyệt của bước, không gồm người lập; bước `sales` phải cùng phòng hồ sơ |
| POST | `/contracts/{id}/assignment` | CTR-10, CTR-08 A4 | `assign` | Quyền `approvals.assign`, người gọi là trưởng (`department.manager_id`) phòng phụ trách bước; `{roundId, stepId, viewedVersion, assigneeId}` → `ReviewDocument`. Gán hoặc đổi người khi bước chưa bắt đầu; kích hoạt bước nếu đã tới lượt (trừ bước chờ bàn giao) |
| POST | `/contracts/{id}/pending-task/retry?step=` | CTR-07 → 09 | `retryPendingTask` | Gửi lại thông báo đang chờ; không chạy lại quyết định |
| GET | `/coordination-inbox` | CTR-08 A1 | `coordinationInbox` | Yêu cầu phối hợp gửi tới phòng ban của người gọi |
| GET | `/contracts/{id}/coordination` | CTR-08 A1 | `coordination` | Yêu cầu phối hợp của hồ sơ |
| POST | `/contracts/{id}/coordination` | CTR-08 A1.2 | `requestCoordination` | `{expected: {roundId, stepId, viewedVersion, step}, department, content}` |
| POST | `/contracts/{id}/coordination/{coordinationId}/reply` | CTR-08 A1.3–4 | `replyCoordination` | `{reply}` |

Kết quả ghi: `{document, pendingTask}`. Mã lỗi: 400 `VALIDATION` / `IDEMPOTENCY_KEY_REQUIRED` / `INVALID_ASSIGNEE`; 403 `FORBIDDEN` / `NOT_ASSIGNEE` / `CSRF_REJECTED`; 404 `NOT_FOUND`; 409 `STEP_DONE` / `STEP_NOT_READY` / `VERSION_MISMATCH` / `IDEMPOTENCY_CONFLICT` / `ASSIGNMENT_IMMUTABLE` / `WORKFLOW_SNAPSHOT_MISSING` / `WORKFLOW_CONFIGURATION_INVALID`. Phân công: 403 `FORBIDDEN` khi không phải trưởng bộ phận phụ trách bước, 409 `ASSIGNMENT_IMMUTABLE` khi bước đã bắt đầu, 400 `INVALID_ASSIGNEE` khi người được chọn không hợp lệ.

Thông báo trong ứng dụng: `GET /api/v1/notifications` (100 thông báo mới nhất của người gọi).
