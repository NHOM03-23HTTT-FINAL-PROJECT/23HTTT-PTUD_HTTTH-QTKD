# API Hợp đồng và phê duyệt (SYS-CTR-01 → 11)

Nguồn: `frontend/src/features/contracts/api/contractsApi.ts`, `workflowApi.ts` và `frontend/src/mocks/contractsServer.ts`, `workflowServer.ts`. Quy ước chung (tiền tố, JWT, Idempotency-Key, mã lỗi) xem [list_api.md](../../../list_api.md).

> CRUD hợp đồng (SYS-CTR-01/02/03/05/06), tệp và US-CTR-19 đã có controller .NET. Submit, rà soát/phê duyệt và cấu hình workflow trong bảng dưới vẫn là đề xuất, được để đợt sau theo lựa chọn người dùng. Xem [cách chạy và giới hạn](../../../backend/GETTING-STARTED.md).

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

## Hồ sơ hợp đồng và rà soát (SYS-CTR-01 → 09, 11)

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
| POST | `/contracts/{code}/review/accept` | CTR-07 b5–6 | `contractsApi.acceptReview` | Submitted → Under Review |
| POST | `/contracts/{code}/review/decisions` | CTR-07/08/09 | `contractsApi.decide` | `{step, roundNo, viewedVersion, decision: approve \| revision \| reject, comment}` → `{contract, notificationFailed, pendingTask?}`; BE kiểm tra assignee và bước hiện tại, hai request đồng thời chỉ một request thành công |
| POST | `/contracts/{code}/review/pending-task/retry` | CTR-07 → 09 | `contractsApi.retryPendingTask` | Thử lại khi giao bước kế tiếp hoặc gửi thông báo bị lỗi |
| POST | `/contracts/{code}/coordination-requests` | CTR-08 A1.2 | `contractsApi.requestCoordination` | `{department, content}` |
| POST | `/contracts/{code}/coordination-requests/{id}/reply` | CTR-08 A1.3–4 | `contractsApi.replyCoordination` | `{reply}` |
| GET | `/approvals/inbox?step=sales\|legal\|board&done=` | CTR-07/08/09 | `contractsApi.inbox` | Hồ sơ chờ xử lý / đã xử lý theo bước |

SYS-CTR-11 (tiến độ, lịch sử phê duyệt) hiện dùng chung `GET /contracts/{code}`. Nếu muốn tách quyền xem lịch sử, có thể thêm `GET /contracts/{code}/approval-history`.

## Cấu hình người tham gia (SYS-CTR-10)

| Method | Endpoint | Hàm FE | Ghi chú |
|---|---|---|---|
| GET | `/workflow-configs` | `workflowApi.list` | |
| GET | `/workflow-configs/{code}` | `workflowApi.getConfig` | |
| GET | `/workflow-configs/participants` | `workflowApi.getPeople` | Người dùng kèm thẩm quyền ký |
| POST | `/workflow-configs` | `workflowApi.activate` (tạo mới) | Idempotency-Key; `{draft, replaceExisting?}`; lỗi `DUPLICATE_SCOPE` (E3) |
| POST | `/workflow-configs/{code}/versions` | `workflowApi.activate` (cập nhật, A1) | Idempotency-Key; `{baseVersion, draft, replaceExisting?}`; lỗi `CONFLICT` (E4). Mỗi lần sửa tạo phiên bản mới, lượt duyệt đang chạy giữ snapshot cũ |

`workflowApi.activate` ở FE đang gộp tạo mới và cập nhật vào một hàm; đề xuất tách thành 2 endpoint như trên.
