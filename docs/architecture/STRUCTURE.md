# Cấu trúc thư mục và bản đồ module

## Hiện trạng ngày 04/11/2026

Backend thực tế ở `backend/`, theo bốn tầng. Module đã có code chạy: Identity (TASK-022/023, trạng thái kiểm chứng ở [plan](../specs/identity/TASK-022-023-PLAN.md)), Contracts (quản lý hợp đồng), duyệt hợp đồng (`ContractApprovals` + `Workflows`) và Notifications (hộp thông báo in-app, UC-CHUNG-05). Các module khác mới có thư mục giữ chỗ (`.gitkeep`) hoặc chỉ có FE mock, chưa phải backend đã triển khai.

EF Core quản lý schema và migration (`QtkdDbContext`, `Infrastructure/Persistence/Migrations`); `QTKD.DbTool` áp migration và seed. Api không tự tạo hay migrate DB. Phần lớn module đọc/ghi bằng SQL qua Npgsql; notifications dùng EF Core LINQ. Tên file dự kiến cho module mới là gợi ý để thống nhất, người chủ trì task quyết định khi triển khai.

## Nguyên tắc tổ chức

- **Chia theo module nghiệp vụ.** Cùng một tên module xuất hiện ở FE, BE (4 tầng), test và docs. Thêm module mới bằng cách nhân bản cấu trúc của module mẫu, không sửa module khác.
- **BE theo 4 tầng** Api / Application / Domain / Infrastructure (TASK-049). Phụ thuộc một chiều: Api → Application → Domain. Application khai báo interface trong `Common/Interfaces/`, Infrastructure cài đặt, `Program.cs` đăng ký DI.
- **Mẫu cho module mới: Controller + Service** như Contracts và Notifications (xem mục [Mẫu module](#mẫu-module-controller--service)). Identity (endpoint trong `Program.cs`) và ContractApprovals (`Endpoints/ContractApprovalEndpoints.cs`) còn dùng Minimal API; chuyển đổi khi người chủ trì module đồng ý, không trộn hai kiểu trong cùng một module.
- **Phân quyền ở BE.** Mỗi permission code trong `PermissionCatalog` là một policy cùng tên; controller dùng `[Authorize(Policy = "<code>")]`. Người thao tác lấy qua `ICurrentActor` (tài khoản phải Active); kiểm tra phạm vi hồ sơ, assignee nằm trong service/store của module.
- **CSRF cho thao tác ghi.** Action ghi dùng `[RequireCsrf]` (`Api/Filters/`): yêu cầu `X-QTKD-CSRF: 1` và `Origin` thuộc `Cors:Origins`, sai trả 403 `CSRF_REJECTED`.
- **Lỗi nghiệp vụ** dùng `BusinessException(code, status, details)` (đang đặt ở `Domain/Contracts`, dùng chung). Middleware trong `Program.cs` trả JSON `{ ...details, code }`. Module cũ còn `ReviewFailure`, `IdentityFailure`. Lỗi không xác định trả 500 `SYSTEM_ERROR`, không ghi chi tiết exception của provider.
- **Workflow phê duyệt là phần dùng chung.** `Features/Workflows/WorkflowEngine` xử lý chuỗi bước tổng quát; khóa bước, vai trò và trạng thái hồ sơ thuộc adapter của từng loại hồ sơ (hiện chỉ có `ContractApprovals`). Hợp đồng chung `IApprovableDocument` (TASK-056) chưa được hiện thực.
- **Nhật ký truy vết append-only.** Bảng `qtkd.audit_log` chỉ được INSERT; trigger `audit_append_only` chặn UPDATE/DELETE. Module ghi audit trong cùng transaction với thay đổi nghiệp vụ.
- **Module Sprint 2/3 đã có thư mục rỗng** để giữ chỗ và cho thấy ranh giới; không triển khai trước khi được giao.

## Bản đồ module

| Module (BE) | FE feature | Sprint | US / PB | Chủ trì theo kế hoạch | Hiện trạng BE |
| --- | --- | --- | --- | --- | --- |
| `Identity` (Auth, Users, Departments, Roles, Permissions) | `auth`, `users` | 1 | PB-02 | Minh | Có code; Minimal API trong `Program.cs`, EF Core |
| `Audit` | `audit-logs` | 1 | PB-03 | Minh | Giữ chỗ (API tra cứu UC-CHUNG-06 đang làm ở nhánh `feat/audit-log`) |
| `Catalogs` (dịch vụ, nhóm dịch vụ, đơn vị tính, thuế suất) | `catalogs` | 1 | PB-04 | Đan Anh | Giữ chỗ |
| `Customers` | `customers` | 1 (mở rộng S2, S3) | CUS-01, 02, 04, 05, 06, 07 | Hiếu | Giữ chỗ |
| `Areas` | `areas` | 1 (mở rộng S2, S3) | ARE-01, 02, 04, 12, 13 | Tuấn | Giữ chỗ |
| `Contracts` | `contracts` | 1 (phụ lục S2, ký/chấm dứt/gia hạn S3) | CTR-01, 02, 03, 04, 05, 06, 16, 18 | Phong; CTR-04..06: Minh | Có code; Controller + Service (module mẫu) |
| `Approvals` (workflow engine) | `approvals` | 1 (rút hồ sơ, chuyển người duyệt S2) | APR-01..06, 09, 10 | Lộc (BE), Đan Anh (FE tiến độ, cấu hình) | Có code: `Workflows` + `ContractApprovals`; Minimal API |
| `Pricing` (báo giá, bảng giá, phiên bản) | `pricing` | 2 | PRC-01..14 | Xuân, Đan Anh, Hiếu | Giữ chỗ |
| `Outputs` (sản lượng, khóa kỳ) | `outputs` | 2 (mở khóa S3) | OUT-01..07, 13 | Minh | Giữ chỗ |
| `Notifications` (Outbox) | `notifications` | 2 | PB-37 | Lộc, Đan Anh | Hộp thông báo in-app (UC-CHUNG-05); Controller + Service. Outbox/gửi ngoài chưa có |
| Tác vụ định kỳ | — (`Infrastructure/BackgroundJobs`) | 2 | PB-38 | Phong | Giữ chỗ |
| `Payments` (bảng thanh toán) | `payments` | 3 | PAY-01..15 | Đan Anh, Minh, Hiếu | Giữ chỗ |
| `Signatures` (ký điện tử mô phỏng) | `signatures` | 3 | SIG-01..11, PAY-07, 08 | Lộc | Chưa có thư mục |
| `AiAssistant` | `ai-assistant` | 3 | PB-135 (cần xác nhận với GV) | Xuân | Giữ chỗ |

Các US tra cứu chéo ở Sprint 3 (CUS-08..10, ARE-14, 15, PRC-17) đặt trong module sở hữu dữ liệu được tra cứu hoặc module khởi phát màn hình; không tạo module "Tra cứu" riêng.

Phụ lục hợp đồng (CTR-09..15) dùng chung vòng đời với hợp đồng nên đặt trong `Contracts` khi đến Sprint 2. US-CTR-16 ở Sprint 1 chỉ làm phần hợp đồng.

## Mẫu module (Controller + Service)

Ví dụ thực tế: Contracts và Notifications.

```
backend/src/
├─ QTKD.Api/
│  ├─ Controllers/<Module>/<Module>Controller.cs   [ApiController], [Route("api/v1/<module>")], [Authorize(Policy=…)]
│  ├─ Filters/RequireCsrfAttribute.cs              Dùng chung cho action ghi
│  └─ Authentication/CurrentActor.cs               ICurrentActor: người thao tác từ JWT + tài khoản Active
├─ QTKD.Application/
│  ├─ Common/Interfaces/I<Module>Store.cs          Hợp đồng truy cập dữ liệu
│  └─ Features/<Module>/
│     ├─ Dtos/        Request (bind từ body/query) và response
│     ├─ Validators/  Kiểm tra đầu vào, ném BusinessException("VALIDATION", 400, …)
│     └─ Services/    Nghiệp vụ; nhận Actor, gọi store
├─ QTKD.Domain/<Module>/                           Quy tắc/kiểu không phụ thuộc HTTP, DB
└─ QTKD.Infrastructure/Persistence/
   └─ Postgres<Module>Store.cs                     Cài đặt store bằng PgDatabase (Npgsql)
```

Luồng một request: Controller lấy `Actor` từ `ICurrentActor` → gọi Service → Service validate và gọi Store → Store chạy SQL, mọi câu lệnh lọc theo phạm vi của actor. Controller không chứa nghiệp vụ; Service không biết HTTP.

## Truy cập dữ liệu

| Cách | Dùng ở | Ghi chú |
| --- | --- | --- |
| EF Core (`IdentityDbContext`) | Identity | Map một phần bảng Identity; không sinh migration |
| EF Core (`QtkdDbContext`) | Toàn schema; Notifications | Sở hữu migration; LINQ cho notifications |
| Npgsql qua `PgDatabase` (tham số `$1, $2…`) | Contracts, Notifications | Cách mặc định cho module mới theo mẫu |
| Npgsql trực tiếp (`PostgresApprovalStore.Command`, tham số có tên) | ContractApprovals | Có khóa dòng `SELECT … FOR UPDATE`, idempotency |

Khi đổi bảng phải sửa entity/configuration trong `Infrastructure/Persistence` (tạo migration EF) và code đọc/ghi tương ứng; chạy `npm run check` trong `DB/` để so model với SQL. SQL viết tay và mapping EF không được kiểm tra lúc build; lệch schema chỉ lộ khi chạy hoặc qua test PostgreSQL.

## Kiểm thử

- `tests/QTKD.UnitTests/<Module>/`: logic thuần của Application/Domain (validator, quy tắc); không HTTP, DB hay mạng.
- `tests/QTKD.IntegrationTests/<Module>ApiTests.cs`: `ApiFactory` chạy pipeline thật (JWT, policy, controller, CSRF) trên SQLite. Store thay bằng spy qua thuộc tính của `ApiFactory` (`NotificationStore`, `ApprovalStore`…); `ICurrentActor` được thay bằng `SqliteCurrentActor` vì bản thật đọc PostgreSQL. Mức này kiểm tra hợp đồng API, không kiểm tra SQL.
- SQL thật: `*PostgresRollbackTests` chạy trong một transaction luôn rollback, bật bằng `QTKD_APPROVAL_ROLLBACK_CONNECTION`; cả suite trên DB Supabase riêng cho test bật bằng `QTKD_TEST_DATABASE_CONNECTION` kèm `QTKD_TEST_DATABASE_IS_DISPOSABLE=true`. Không đặt biến thì các test này bị skip.

## Thư mục đang dùng

| Đường dẫn | Vai trò |
| --- | --- |
| frontend/src/features/ | Feature FE, gồm auth API và các màn nghiệp vụ prototype |
| frontend/src/lib/http/client.ts | Transport fetch, access token trong bộ nhớ, refresh/logout coordination |
| frontend/src/app/router/BusinessRoute.tsx | Ngăn mount màn nghiệp vụ mock với danh tính API |
| backend/src/QTKD.Api/ | Composition root, JWT, policy, middleware lỗi; `Controllers/`, `Endpoints/` (Minimal API cũ), `Filters/`, `Authentication/` |
| backend/src/QTKD.Application/ | `Common/Interfaces/` và `Features/<Module>/` (DTO, validator, service) |
| backend/src/QTKD.Domain/ | Entity, enum, quy tắc theo module |
| backend/src/QTKD.Infrastructure/ | `Persistence/` (PgDatabase, store Postgres, IdentityDbContext), `Identity/`, `ContractApprovals/` |
| backend/tests/QTKD.IntegrationTests/ | WebApplicationFactory; SQLite mặc định, PostgreSQL khi cấu hình rõ |
| backend/tests/QTKD.UnitTests/ | Unit test cho logic thuần; không HTTP, DB hay mạng |
| backend/scripts/ và Start-Api.ps1 | Launcher local và chuyển đổi cấu hình .env/URI |
| backend/src/QTKD.Infrastructure/Persistence/Migrations/ | Migration EF Core; nguồn DDL duy nhất |
| DB/ | Tài liệu schema, data dictionary, test PGlite và lệnh npm gọi `QTKD.DbTool` |
| docs/decisions/, specs/, setup/, testing/ | Quyết định, use case/hợp đồng API, hướng dẫn team và bằng chứng kiểm thử |
| context/ và AGENTS.md | Phạm vi, nghiệp vụ và hướng dẫn agent |

Không tạo một backend độc lập trong `BE/` để tích hợp. [README gốc](../../README.md) là điểm bắt đầu cho setup; [changelog](../specs/identity/CHANGELOG.md) ghi các ràng buộc tích hợp.

## Thêm một module mới

1. Thêm dòng vào bảng bản đồ module ở trên.
2. DB: thêm bảng/cột bằng migration EF Core (`dotnet ef migrations add ... -c QtkdDbContext`), áp bằng `QTKD.DbTool`; Api không tự tạo schema.
3. BE theo [mẫu module](#mẫu-module-controller--service):
   - `Application/Common/Interfaces/I<Module>Store.cs` và `Application/Features/<Module>/{Dtos,Validators,Services}`.
   - `Domain/<Module>/` cho quy tắc, kiểu dùng chung giữa các tầng.
   - `Infrastructure/Persistence/Postgres<Module>Store.cs` dùng `PgDatabase`. Thao tác có ghi audit thì INSERT `qtkd.audit_log` trong cùng transaction.
   - `Api/Controllers/<Module>/<Module>Controller.cs` với `[Authorize(Policy = …)]`, `ICurrentActor`, `[RequireCsrf]` cho action ghi. Permission mới thêm vào `PermissionCatalog`, migration grants và `demo-seed.json`.
   - `Program.cs`: đăng ký store và service.
4. Test: `UnitTests/<Module>/` cho validator và quy tắc; `IntegrationTests/<Module>ApiTests.cs` với spy store (thêm thuộc tính override vào `ApiFactory`); SQL thật trong `<Module>PostgresRollbackTests.cs`.
5. FE: tạo `features/<module>/{api,components,hooks,pages,types}` và khai báo route trong `app/router`.
6. Nếu hồ sơ cần phê duyệt: dùng `WorkflowEngine` qua adapter của loại hồ sơ, thêm loại hồ sơ vào cấu hình quy trình. Không viết luồng duyệt riêng trong module.
7. Docs: tạo `docs/specs/<module>/`.
