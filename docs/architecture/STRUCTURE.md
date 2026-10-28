# Cấu trúc thư mục và bản đồ module

Tài liệu này mô tả bộ khung thư mục cho toàn dự án QTKD. Bộ khung chỉ gồm thư mục, `.gitkeep` và README; chưa có source, project file, dependency hay migration. Tên file dự kiến trong các README là gợi ý để thống nhất cách đặt tên, người chủ trì task quyết định khi triển khai.

## Nguyên tắc tổ chức

- **Chia theo module nghiệp vụ.** Cùng một tên module xuất hiện ở FE, BE (4 tầng), test và docs. Thêm module mới ở Sprint 2/3 bằng cách nhân bản cấu trúc của một module Sprint 1 có sẵn, không sửa module khác.
- **BE theo 4 tầng** Api / Application / Domain / Infrastructure (TASK-049). Phụ thuộc một chiều: Api → Application → Domain; Infrastructure cài đặt interface của Application.
- **Workflow phê duyệt là module dùng chung** (`Approvals`), không nằm trong `Contracts`. Hồ sơ nào cần duyệt (hợp đồng, phụ lục, bảng giá, bảng thanh toán, đề nghị mở khóa kỳ…) chỉ cần cài đặt hợp đồng chung `IApprovableDocument` (TASK-056) và khai báo loại hồ sơ trong cấu hình quy trình.
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

## Cây tổng thể

```text
23HTTT-PTUD_HTTTH--QTKD/
  AGENTS.md, README.md, .gitignore
  .agents/skills/qtkd-sprint1/     Skill cho agent
  context/                         Context dự án, Sprint 1, business rules
  docs/
    sources/                       PDF đề bài, workbook kế hoạch (giữ nguyên)
    architecture/                  Tài liệu này, sơ đồ kiến trúc
    decisions/                     Quyết định kỹ thuật cần chốt (ADR)
    specs/<module>/                Đặc tả UC theo module
    diagrams/use-case|class|sequence/
    ui/                            Liên kết Figma, ảnh chụp màn hình
    testing/test-plan|test-cases|postman|demo/
  BE/                              .NET Web API (xem BE/README.md)
    src/QTKD.Api | QTKD.Application | QTKD.Domain | QTKD.Infrastructure
    tests/QTKD.UnitTests | QTKD.IntegrationTests
  FE/                              React + TypeScript + Vite (xem FE/README.md)
    public/, src/{app,layouts,components,lib,features,...}, tests/
  DB/                              ERD, seed, script, từ điển dữ liệu (xem DB/README.md)
```

## Thêm một module mới

1. Thêm dòng vào bảng bản đồ module ở trên.
2. BE: tạo `Controllers/<Module>`, `Features/<Module>/{Dtos,Services,Validators}`, `Domain/<Module>`, `Persistence/Configurations/<Module>`, `tests/QTKD.UnitTests/<Module>`.
3. FE: tạo `features/<module>/{api,components,hooks,pages,types}` và khai báo route trong `app/router`.
4. Nếu hồ sơ cần phê duyệt: cài đặt `IApprovableDocument`, thêm loại hồ sơ vào cấu hình quy trình. Không viết luồng duyệt riêng trong module.
5. Docs: tạo `docs/specs/<module>/`.
