---
name: qtkd-sprint1
description: Thực hiện hoặc review công việc Sprint 1 của dự án QTKD logistics theo TASK/PB/US, kiểm tra phạm vi hợp đồng và workflow phê duyệt. Dùng khi làm việc trong repo QTKD; không dùng cho dự án khác hoặc tự mở rộng sang Sprint 2/3.
---

# Làm việc theo Sprint 1 QTKD

## Xác định công việc

Đọc `AGENTS.md` ở gốc repo. Chỉ tạo/sửa code hoặc tài liệu khi yêu cầu người dùng cho phép việc đó; một câu hỏi phân tích không tự cho phép chỉnh sửa.

Các đường dẫn bên dưới tính từ gốc repo, là thư mục chứa `AGENTS.md` và `frontend/`, `BE/`, `DB/`:

- Đọc `context/PROJECT.md` để biết nguồn và quyết định còn thiếu.
- Đọc `context/SPRINT-1.md` để đối chiếu TASK/PB/US, chủ trì và phạm vi.
- Khi xử lý hợp đồng, phân quyền, workflow hoặc audit, đọc `context/BUSINESS-RULES.md`.
- Khi cần AC hoặc nội dung task chính xác, tra `docs/sources/SprintPlan_QTKD.xlsx`; đối chiếu quy tắc nền trong `docs/sources/QTKD_DATH (1).pdf`.

Nếu task không có mã, ánh xạ sang nhóm công việc phù hợp trước khi làm. Không gán nhầm mã US trong workbook với mã business rule cùng hậu tố trong PDF.

## Giữ đúng phạm vi

FE theo kế hoạch là React/TypeScript/Vite; BE là C#/.NET Web API, hướng Api/Application/Domain/Infrastructure; DB là PostgreSQL qua Supabase và EF Core. Phiên bản, cách xác thực cụ thể và vị trí migration chưa chốt. Kiểm tra hiện trạng repo khi triển khai thay vì giả định ứng dụng đã tồn tại.

Sprint 1 tập trung nền tảng, khách hàng, khu vực, hợp đồng và workflow. US-CTR-16 chỉ làm hợp đồng. Phụ lục, bảng giá, sản lượng, thông báo, ký điện tử và AI Agent sản phẩm tuân theo phân kỳ trong context.

GitLab trong đề và GitHub trong kế hoạch là khác biệt chưa giải quyết. Không chọn nhà cung cấp hoặc tạo CI theo suy đoán. Workbook có AC rút gọn và tham chiếu file user story chưa có; nêu rõ khoảng trống ảnh hưởng công việc thay vì coi nội dung tự bổ sung là yêu cầu gốc.

## Khi được giao triển khai hoặc review workflow

Kiểm tra khả năng cấu hình và phiên bản/snapshot của lượt đang chạy. Kiểm tra assignee hiện tại ở BE, thứ tự bước, lý do reject/revision, cập nhật trạng thái hồ sơ, lịch sử và audit. Với submit lặp hoặc duyệt đồng thời, kiểm tra tính nhất quán và chống xử lý trùng. Dữ liệu cấu hình hợp đồng ba cấp không được biến thành engine cố định ba cấp cho mọi hồ sơ.

Chọn kiểm tra quan sát được đúng phần thay đổi: người không được giao bị chặn, submit retry không tạo lượt trùng, approve đồng thời chỉ thành công một lần, sửa cấu hình không đổi lượt đang chạy, sửa hợp đồng sai trạng thái bị chặn. Không báo các kiểm tra này đã đạt nếu mới viết tài liệu hoặc chưa có môi trường chạy.

## Bàn giao công việc

Nêu file đã thay đổi, TASK/US được xử lý, kiểm tra thực tế và khoảng trống còn lại. Tạo bộ khung không đồng nghĩa hoàn tất task dựng ứng dụng, kết nối DB hoặc repo/CI. Chỉ cập nhật tài liệu tiến độ khi người dùng giao cập nhật đó.
