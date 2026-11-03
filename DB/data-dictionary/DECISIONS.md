# Quyết định chuyển data dictionary thành schema

Nguồn là `data-dictionary.md` và `spec nghiệp vụ + hệ thống (8).docx` do người dùng cung cấp. Phạm vi được giao là toàn bộ schema của data dictionary, bao gồm bảng các sprint sau, không triển khai API hoặc chức năng ứng dụng tương ứng.

## Kiểu dữ liệu và cấu trúc

- UUID cho PK; bảng/cột giữ `snake_case`. Chưa thêm mã hiển thị KH-0001/HĐ-0001 vì dictionary không có cột mã riêng.
- `date` cho ngày hiệu lực; `timestamptz` cho thời điểm. `AREA_ASSIGNMENT.from_date/to_date` dùng thời điểm theo comment đã thống nhất.
- Decimal(19,2) cho tiền; Decimal(19,4) cho diện tích, sức chứa, sản lượng. Cần đối chiếu giới hạn thực tế khi nhóm chốt dữ liệu.
- Enum tiếng Anh không có khoảng trắng, ví dụ UnderReview, RevisionRequested, Succeeded. FE cần ánh xạ nhãn tiếng Việt.
- Trường chưa có kết quả là NULL: người/thời điểm quyết định, kết quả đối soát, thông tin ký. `DEPARTMENT.manager_id` nullable để khởi tạo quan hệ vòng với USER_ACCOUNT.
- Foreign key RESTRICT, không xóa dây chuyền hồ sơ và lịch sử. Quan hệ AREA_SERVICE dùng PK kép.
- Tên đăng nhập, email công ty, mã khu vực được kiểm tra unique không phân biệt hoa/thường ở SQL. Tên khu vực không trùng trong cùng cha, kể cả cấp gốc.
- Cột `version` của Customer và `row_version` của Area tự tăng khi có thay đổi thực. Contract version tăng khi nội dung đổi. Backend phải dùng điều kiện phiên bản đã đọc và xử lý cập nhật 0 dòng để phát hiện xung đột.

## Comment và khác biệt giữa các nguồn

- Loại cột bị gạch bỏ: CONTRACT.department_id, CONTRACT_ITEM.scope, CHANGE_REQUEST.detail và hai cột replacement_*. Thêm CONTRACT.updated_at theo comment đã thống nhất. Không tự triển khai các đề nghị trong comment còn mở.
- Giữ một role bắt buộc mỗi tài khoản theo dictionary, đã được người dùng chốt Phase 0 TASK-022/023 ngày 02/11/2026. Không triển khai nhiều role; thiếu grants khác với thiếu role. Các bổ sung Identity theo ADR 0001–0003 và migration 0003, không sửa dữ liệu dictionary nguồn.
- Giữ coordinates dạng text; chưa tách lat/long hay thêm PostGIS.
- ATTACHMENT/CHANGE_REQUEST/APPROVAL_ROUND/SIGNING_SESSION dùng record_type Contract hoặc PaymentStatement, với CHECK đúng một FK tương ứng. Phụ lục nằm trong CONTRACT, phân biệt bằng document_type.
- Giữ assignee_id NOT NULL và bất biến sau khi tạo bước theo dictionary. Spec có tình huống chờ phân công; muốn hỗ trợ phải thiết kế trạng thái và nullability bổ sung.
- Giữ CHANGE_REQUEST.contract_id vì cột chưa bị xóa trong dictionary, nhưng không suy ra quyền rút/chỉnh sửa hợp đồng bằng luồng generic này. Comment trong tài liệu cho biết luồng hợp đồng còn khác biệt.
- Bộ trạng thái bám dictionary. PRICE_LIST chưa có Submitted/Rejected/Superseded; APPROVAL_ROUND chưa có FK bảng giá. Chưa tự bổ sung các trạng thái/quan hệ này từ những phần spec còn khác nhau.

## Ràng buộc đã chuẩn bị

Migration có CHECK về MST, liên hệ khách hàng, kích thước/cấp khu vực, ngày hiệu lực, số tiền và dữ liệu quyết định. Index chặn hai lượt duyệt đang chạy trên cùng hồ sơ, hai bước hiện hành trong cùng lượt và hai phiên ký đang chạy cho cùng hồ sơ. Trigger cấm sửa/xóa/truncate audit log, giữ snapshot/lịch sử duyệt, bảo vệ nội dung hợp đồng ngoài Draft/RevisionRequested và tính đường dẫn cây khu vực.

RLS bật cho cả 26 bảng (và các bảng Identity thêm sau), thu hồi quyền của anon/authenticated; chưa tạo policy mở dữ liệu. Backend cần kết nối server được cấp quyền riêng. Không giả định dùng Supabase Auth hay nối USER_ACCOUNT với auth.users; không đưa Prisma Client hoặc PostgreSQL password vào frontend.

## Công việc vẫn cần có ở backend hoặc migration tiếp theo

Quyền theo vai trò/phạm vi hồ sơ, danh tính người thực hiện và assignee hiện tại phải kiểm tra ở API. CHECK decided_by = assignee_id không xác thực người gửi request. Transaction phải cập nhật nhất quán hồ sơ, lượt, bước và audit; hiện chưa có API/interceptor tự ghi audit. Kiểm tra khu vực/dịch vụ/khách hàng Active và các trạng thái chuyển tiếp không được thay thế bằng nút ẩn ở FE.

Dictionary chưa có Outbox, Idempotency-Key, dedup sự kiện callback ký, lịch sử phiên bản sản lượng hoặc đề nghị mở khóa. Không tự thêm các bảng này ngoài phạm vi 26 bảng. Snapshot demo chứa đối tượng workflow để minh họa bảo toàn cấu hình.

SYS-CTR-10 (chốt 03/11/2026): trưởng bộ phận phân công người duyệt cho từng hồ sơ, lưu thẳng vào `approval_step.assignee_id`; không có bảng cấu hình. Bảng `workflow_config` tạo ở migration `202611030002` đã bị bỏ ở `202611030003_approval_assignment`. Trigger `guard_approval_history` cho đổi người khi bước `NotStarted` hoặc `Pending` chưa tiếp nhận; quyết định và thứ tự vẫn không sửa được. Trưởng bộ phận xác định qua `department.manager_id`; người phân công còn phải có quyền `approvals.assign`, chỉ cấp cho vai trò trưởng: SalesManager, LegalManager (Trưởng phòng Pháp chế), BoardChair (Tổng Giám đốc). Seed đặt trưởng Pháp chế là `demo.legal.manager`, trưởng BGĐ là `demo.board.chair`.

Seed nhập lịch sử giả lập bằng INSERT; trigger bảo vệ cập nhật lịch sử không biến dữ liệu nhập sẵn thành bằng chứng quy trình đã thực thi. Các kiểm tra race condition, trigger, RLS, rollback và seed hai lần vẫn cần môi trường Supabase thực tế. Test offline chỉ xác nhận hình dạng và tính nhất quán của dữ liệu.
