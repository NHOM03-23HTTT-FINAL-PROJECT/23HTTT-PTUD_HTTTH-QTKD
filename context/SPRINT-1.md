# Sprint 1

## Mục tiêu và phạm vi

Theo `Tổng quan!A7:I7` của [kế hoạch](../docs/sources/SprintPlan_QTKD.xlsx): Sprint 1 chạy từ **25/10/2026 đến 07/11/2026**, demo MVP1 ngày **07/11**. Kế hoạch ghi 27 US, 67 task, 250 giờ. Có 32 PB trong Sprint 1, gồm cả các PB nền tảng không tương ứng từng US.

Mục tiêu: hoàn thiện US/AC, đặc tả, UI, ERD và khung dự án; phát triển nền tảng đăng nhập/phân quyền/audit log/danh mục; khách hàng; khu vực; hợp đồng; workflow engine cấu hình được.

Các nội dung dưới đây là kế hoạch triển khai, chưa phải chức năng đã có trong bộ khung.

| Nhóm công việc | Phạm vi Sprint 1 | Chủ trì theo kế hoạch | Task |
| --- | --- | --- | --- |
| Điều phối và UI | UC chung, Figma, review và ghép nối | Xuân | TASK-001..010 |
| Khách hàng | Tạo/sửa, tìm kiếm/phân trang, xem chi tiết, tạm ngưng/kích hoạt; unique mã/MST | Hiếu | TASK-011..020 |
| Nền tảng và duyệt HĐ | JWT, người dùng/phòng ban/vai trò/quyền, audit log append-only; duyệt HĐ ba cấp | Minh | TASK-021..028 |
| ERD, FE và tiến độ | Khung FE/component, danh mục dùng chung, API lịch sử/tiến độ, hồ sơ chờ xử lý, UI cấu hình workflow | Đan Anh | TASK-029..037 |
| Khu vực và kiểm thử | Cây khu vực tối đa ba cấp, chặn vòng lặp, tạo/sửa/tìm/xem, lookup Active; test plan/demo | Tuấn | TASK-038..047 |
| Khung BE và workflow | .NET/Supabase/repo, mô hình workflow, cấu hình phiên bản, submit/approve/reject/request revision | Lộc | TASK-048..057 |
| Hợp đồng | Tạo/sửa nháp, tệp đính kèm, danh sách/chi tiết theo quyền, submit, sửa khi yêu cầu, hủy dự thảo | Phong | TASK-058..067 |

Nguồn phân công: `Tổng quan!A15:I21`, `Sprint Backlog!A6:J72`. Mã PB/US và các AC hiển thị nằm ở `Product Backlog!A6:I37`. Khi nhận task, đọc dòng tương ứng để xác định yêu cầu cụ thể.

## Danh sách US trong Sprint 1

- Khách hàng: CUS-01, 02, 04, 05, 06, 07.
- Khu vực: ARE-01, 02, 04, 12, 13.
- Hợp đồng: CTR-01, 02, 03, 04, 05, 06, 16, 18.
- Phê duyệt: APR-01, 02, 03, 04, 05, 06, 09, 10.

Đây là mã **US**, không phải mã business rule có thể trùng hậu tố trong PDF. Ví dụ US-CTR-04 là rà soát ở cấp Trưởng phòng Kinh doanh, còn rule CTR-04 trong PDF nói về hồ sơ Rejected.

US-CTR-16 trong Sprint 1 chỉ làm hợp đồng; phần phụ lục chuyển Sprint 2 (`Product Backlog!I24`).

## Các đầu việc liên quan bộ khung

- TASK-031 (`Sprint Backlog!D36`): FE React/TypeScript/Vite và cơ chế gọi API theo JWT.
- TASK-049 (`D54`): khung .NET Api/Application/Domain/Infrastructure, kết nối PostgreSQL qua Supabase, EF Core migration.
- TASK-050 (`D55`): repo, bảo vệ nhánh và CI. Có khác biệt GitHub/GitLab được ghi tại [PROJECT.md](PROJECT.md).
- TASK-051..057 (`D56:D62`): thiết kế và triển khai workflow engine cùng kiểm thử.

Yêu cầu hiện tại chỉ tạo thư mục và context/skill. Bộ khung này không hoàn thành TASK-031, TASK-049 hay TASK-050.

## Lịch tuần đầu

Theo sheet `Sprint plan 01 - tuần 1`:

- 25/10-27/10: US và AC theo module (dòng 2-8).
- 27/10-29/10: đặc tả hệ thống (dòng 9-15).
- 29/10-31/10: UI do Xuân; khung dự án do Lộc; ERD do Đan Anh (dòng 16-18).
- 31/10-02/11: FE theo UI do Xuân (dòng 19); phần phân chia task chi tiết xem Sprint Backlog, gồm khung FE do Đan Anh.

## Kịch bản nghiệm thu MVP1 theo kế hoạch

1. Có tài khoản mẫu thuộc sáu phòng ban và quyền phù hợp.
2. Cấu hình quy trình hợp đồng: Trưởng phòng Kinh doanh, Pháp chế, Ban Giám đốc.
3. Tạo khách hàng và khu vực ba cấp.
4. Tạo hợp đồng Draft kèm tệp rồi trình duyệt.
5. Qua cấp Kinh doanh; Pháp chế yêu cầu chỉnh sửa, có lý do.
6. Người phụ trách sửa và trình lại theo đặc tả sẽ chốt; không mất lịch sử lượt trước.
7. Hoàn tất các bước, Ban Giám đốc duyệt, hợp đồng đạt Approved.
8. Xem tiến độ, người đang xử lý, lịch sử và audit log.
9. Người không được giao không duyệt được. Submit lặp không tạo lượt duyệt trùng; hai request duyệt đồng thời không hoàn thành một bước hai lần.

Nguồn: `Tổng quan!F7`, TASK-054, TASK-055, TASK-057; PDF mục 5.4-5.5. Bước bắt đầu lại khi resubmit và cách xử lý Rejected cần theo UC chi tiết, chưa tự chọn trong bộ khung.

## Ngoài phạm vi triển khai Sprint 1

Phụ lục, bảng giá có phiên bản/hiệu lực, sản lượng/khóa kỳ, thông báo Outbox và job theo ngày thuộc Sprint 2 theo kế hoạch. Thanh toán đầy đủ, ký điện tử mô phỏng bất đồng bộ, AI Agent trong sản phẩm và deploy bản release thuộc Sprint 3. Sprint 1 chỉ chuẩn bị khả năng mở rộng khi thiết kế phần liên quan.
