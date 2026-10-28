# Context dự án

## Bối cảnh

Công ty ABC cung cấp dịch vụ logistics, khai thác cảng, vận chuyển, lưu kho, bốc xếp và vận hành thiết bị. Hệ thống tập trung quản lý vòng đời khách hàng, hợp đồng, bảng giá, sản lượng, thanh toán, phê duyệt và ký điện tử.

Sáu phòng ban/vai trò nghiệp vụ trong đề: Kinh doanh, Khai thác, Kế toán, Pháp chế, Ban Giám đốc, Quản trị hệ thống.

## Cách dùng nguồn

| Nguồn | Nội dung cần tra |
| --- | --- |
| [Đề bài PDF](../docs/sources/QTKD_DATH%20%281%29.pdf) | Trang 2-3: nghiệp vụ; trang 4-5: CTR/PRC/PAY/APR; trang 5-6: ràng buộc kỹ thuật; trang 6: công nghệ |
| [Kế hoạch Excel](../docs/sources/SprintPlan_QTKD.xlsx) | `Tổng quan`: mục tiêu và lịch; `Product Backlog`: PB/US/AC; `Sprint Backlog`: TASK, chủ trì, ước tính; `Sprint plan 01 - tuần 1`: lịch tuần đầu |

Yêu cầu trực tiếp của người dùng xác định công việc được phép thực hiện. PDF cung cấp yêu cầu của đề; workbook cung cấp phân kỳ và phân công. Nếu hai nguồn khác nhau, ghi rõ khác biệt thay vì âm thầm chọn một nguồn.

Context tổng hợp từ hai file được cung cấp ngày 28/10/2026. Không suy ra tiến độ code hiện tại từ trạng thái task trong Excel. Bộ khung này chưa triển khai tính năng.

## Công nghệ ghi trong nguồn

| Phần | Căn cứ |
| --- | --- |
| FE | React + TypeScript + Vite, routing, layout theo quyền, axios + JWT interceptor (`Sprint Backlog!D36`, TASK-031) |
| BE | C#/.NET Web API theo PDF trang 6; hướng Api/Application/Domain/Infrastructure trong TASK-049 (`Sprint Backlog!D54`) |
| DB | PostgreSQL theo PDF; kết nối Supabase, EF Core migration trong TASK-049 |
| Thiết kế | UML use case, class, sequence; Figma UI/prototype theo PDF trang 6 |

Đây là định hướng cho công việc triển khai sau. Chưa có source, dependency hoặc cấu hình chạy.

## Những điểm cần chốt khi công việc liên quan được giao

- **Git hosting:** PDF trang 6 yêu cầu GitLab; TASK-050 và lịch tuần đầu ghi GitHub/GitHub Actions. Thư mục đích đã có remote GitHub `Spring-anzuaviv/23HTTT-PTUD_HTTTH--QTKD`, đang public. Yêu cầu của người dùng là dựng bộ khung trong thư mục này. Chưa push bộ khung; chưa cấu hình CI. Việc đáp ứng yêu cầu GitLab của đề vẫn cần nhóm xác nhận.
- **Phiên bản:** chưa có phiên bản .NET, Node.js, PostgreSQL hoặc thư viện cụ thể trong nguồn. Chọn khi dựng ứng dụng, ghi lại quyết định.
- **Xác thực:** TASK-022 nêu JWT/hash mật khẩu; Supabase được nêu cho PostgreSQL. Chưa có căn cứ khẳng định dùng Supabase Auth hoặc Supabase Storage.
- **Migration:** kế hoạch nêu EF Core migration nhưng chưa chốt vị trí lưu migration giữa BE/DB. Chọn một nguồn schema chuẩn khi triển khai, tránh duy trì hai bộ DDL độc lập.
- **Đặc tả/AC:** chưa có file user story đầy đủ, UC chi tiết, Figma hoặc ERD. Nhiều ô AC trong Product Backlog có dòng “AC khác trong file user story”. Không xem phần hiển thị là toàn bộ AC.
- **Nhánh và review:** TASK-001 yêu cầu chốt quy ước, TASK-050 yêu cầu bảo vệ nhánh; nguồn chưa nêu chi tiết chính sách. Nhánh hiện tại là `main`; lần dựng bộ khung này không cấu hình branch protection.

Skill trong repo hỗ trợ agent phát triển dự án. Chức năng AI Agent bên trong sản phẩm là một hạng mục khác, được kế hoạch đưa vào Sprint 3 (TASK-133).
