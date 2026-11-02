# Cấu trúc thư mục và bản đồ module

## Cập nhật Identity ngày 02/11/2026

Backend thực tế ở `backend/`. TASK-022/023 đã có source theo bốn tầng, module Identity và test host; trạng thái kiểm chứng ở [plan](../specs/identity/TASK-022-023-PLAN.md). Prisma tiếp tục quản lý migration trong DB/, EF Core chỉ map dữ liệu. Cấu trúc các module khác bên dưới là kế hoạch khởi tạo, không phải các tính năng đã triển khai.

Tài liệu này mô tả source hiện có và bản đồ module dự kiến cho toàn dự án QTKD. Identity có code chạy; các module còn giữ .gitkeep hoặc chỉ có FE mock chưa phải backend đã triển khai. Tên file dự kiến cho module mới là gợi ý để thống nhất, người chủ trì task quyết định khi triển khai.

## Nguyên tắc tổ chức

- **Chia theo module nghiệp vụ.** Cùng một tên module xuất hiện ở FE, BE (4 tầng), test và docs. Thêm module mới ở Sprint 2/3 bằng cách nhân bản cấu trúc của một module Sprint 1 có sẵn, không sửa module khác.
- **BE theo 4 tầng** Api / Application / Domain / Infrastructure (TASK-049). Phụ thuộc một chiều: Api → Application → Domain; Infrastructure cài đặt interface của Application.
- **Workflow phê duyệt định hướng là module dùng chung** (`Approvals`), không nằm trong `Contracts`. Hợp đồng chung `IApprovableDocument` (TASK-056) và khai báo loại hồ sơ thuộc phần triển khai workflow tiếp theo, chưa được hiện thực bởi TASK-022/023.
- **Module Sprint 2/3 đã có thư mục rỗng** để giữ chỗ và cho thấy ranh giới; không triển khai trước khi được giao.

## Bản đồ module

| Module (BE) | FE feature | Sprint | US / PB | Chủ trì theo kế hoạch |
| --- | --- | --- | --- | --- |
| `Identity` (Auth, Users, Departments, Roles, Permissions) | `auth`, `users` | 1 | PB-02 | Minh |
| `Audit` | `audit-logs` | 1 | PB-03 | Minh |
| `Catalogs` (dịch vụ, nhóm dịch vụ, đơn vị tính, thuế suất) | `catalogs` | 1 | PB-04 | Đan Anh |
| `Customers` | `customers` | 1 (mở rộng S2, S3) | CUS-01, 02, 04, 05, 06, 07 | Hiếu |
| `Areas` | `areas` | 1 (mở rộng S2, S3) | ARE-01, 02, 04, 12, 13 | Tuấn |
| `Contracts` | `contracts` | 1 (phụ lục S2, ký/chấm dứt/gia hạn S3) | CTR-01, 02, 03, 04, 05, 06, 16, 18 | Phong; CTR-04..06: Minh |
| `Approvals` (workflow engine) | `approvals` | 1 (rút hồ sơ, chuyển người duyệt S2) | APR-01..06, 09, 10 | Lộc (BE), Đan Anh (FE tiến độ, cấu hình) |
| `Pricing` (báo giá, bảng giá, phiên bản) | `pricing` | 2 | PRC-01..14 | Xuân, Đan Anh, Hiếu |
| `Outputs` (sản lượng, khóa kỳ) | `outputs` | 2 (mở khóa S3) | OUT-01..07, 13 | Minh |
| `Notifications` (Outbox) | `notifications` | 2 | PB-37 | Lộc, Đan Anh |
| Tác vụ định kỳ | — (`Infrastructure/BackgroundJobs`) | 2 | PB-38 | Phong |
| `Payments` (bảng thanh toán) | `payments` | 3 | PAY-01..15 | Đan Anh, Minh, Hiếu |
| `Signatures` (ký điện tử mô phỏng) | `signatures` | 3 | SIG-01..11, PAY-07, 08 | Lộc |
| `AiAssistant` | `ai-assistant` | 3 | PB-135 (cần xác nhận với GV) | Xuân |

Các US tra cứu chéo ở Sprint 3 (CUS-08..10, ARE-14, 15, PRC-17) đặt trong module sở hữu dữ liệu được tra cứu hoặc module khởi phát màn hình; không tạo module "Tra cứu" riêng.

Phụ lục hợp đồng (CTR-09..15) dùng chung vòng đời với hợp đồng nên đặt trong `Contracts` khi đến Sprint 2. US-CTR-16 ở Sprint 1 chỉ làm phần hợp đồng.

## Thư mục đang dùng

| Đường dẫn | Vai trò |
| --- | --- |
| frontend/src/features/ | Feature FE, gồm auth API và các màn nghiệp vụ prototype |
| frontend/src/lib/http/client.ts | Transport fetch, access token trong bộ nhớ, refresh/logout coordination |
| frontend/src/app/router/BusinessRoute.tsx | Ngăn mount màn nghiệp vụ mock với danh tính API |
| backend/src/QTKD.Api/ | Composition root, JWT middleware, policies và Minimal API endpoints trong Program.cs |
| backend/src/QTKD.Application/Features/Identity/ | Interface dịch vụ, DTO, role mapping và lỗi ứng dụng |
| backend/src/QTKD.Domain/Identity/ | Entity/enum Identity không phụ thuộc HTTP/EF |
| backend/src/QTKD.Infrastructure/ | IdentityService, custom store/hasher, TokenIssuer và DbContext |
| backend/tests/QTKD.IntegrationTests/ | WebApplicationFactory; SQLite mặc định, PostgreSQL riêng khi cấu hình rõ |
| backend/scripts/ và Start-Api.ps1 | Launcher local và chuyển đổi cấu hình .env/URI |
| DB/prisma/ | Schema, migration và seed; nguồn DDL duy nhất |
| docs/decisions/, specs/identity/, setup/, testing/ | Quyết định, hợp đồng API, hướng dẫn team và bằng chứng kiểm thử |
| context/ và AGENTS.md | Phạm vi, nghiệp vụ và hướng dẫn agent |

Code Identity hiện dùng Minimal APIs và service interface; chưa áp đặt Controllers/MediatR cho module sau. Không tạo một backend độc lập trong BE/ để tích hợp. [README gốc](../../README.md) là điểm bắt đầu cho setup; [changelog](../specs/identity/CHANGELOG.md) ghi các ràng buộc tích hợp.

## Thêm một module mới

1. Thêm dòng vào bảng bản đồ module ở trên.
2. BE: tạo `Controllers/<Module>`, `Features/<Module>/{Dtos,Services,Validators}`, `Domain/<Module>`, `Persistence/Configurations/<Module>`, `tests/QTKD.UnitTests/<Module>`.
3. FE: tạo `features/<module>/{api,components,hooks,pages,types}` và khai báo route trong `app/router`.
4. Nếu hồ sơ cần phê duyệt: cài đặt `IApprovableDocument`, thêm loại hồ sơ vào cấu hình quy trình. Không viết luồng duyệt riêng trong module.
5. Docs: tạo `docs/specs/<module>/`.
