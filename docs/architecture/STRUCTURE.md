# Cấu trúc thư mục và bản đồ module

## Hiện trạng ngày 04/11/2026

Backend thực tế ở `backend/`, theo bốn tầng. Module đã có code chạy: Identity (TASK-022/023, trạng thái kiểm chứng ở [plan](../specs/identity/TASK-022-023-PLAN.md)), Contracts (quản lý hợp đồng), duyệt hợp đồng (`ContractApprovals` + `Workflows`) và Notifications (hộp thông báo in-app, UC-CHUNG-05). Các module khác mới có thư mục giữ chỗ (`.gitkeep`) hoặc chỉ có FE mock, chưa phải backend đã triển khai.

EF Core quản lý schema và migration (`QtkdDbContext`, `Infrastructure/Persistence/Migrations`); `QTKD.DbTool` áp migration và seed. Api không tự tạo hay migrate DB. Phần lớn module đọc/ghi bằng SQL qua Npgsql; notifications dùng EF Core LINQ. Tên file dự kiến cho module mới là gợi ý để thống nhất, người chủ trì task quyết định khi triển khai.

## Nguyên tắc tổ chức

- **Chia theo module nghiệp vụ.** Cùng một tên module xuất hiện ở FE, BE (4 tầng), test và docs. Thêm module mới bằng cách nhân bản cấu trúc của module mẫu, không sửa module khác.
- **BE theo 4 tầng** Api / Application / Domain / Infrastructure (TASK-049). Phụ thuộc một chiều: Api → Application → Domain. Application khai báo interface trong `Common/Interfaces/`, Infrastructure cài đặt, `Program.cs` đăng ký DI.
- **Mẫu cho module mới: Controller → Service → Repository (EF Core)**, module mẫu là **Notifications** (xem [Mẫu module](#mẫu-module-controller--service--repository)). Module mới làm đúng mẫu này. Kiểu cũ không nhân bản: Contracts (`I<Module>Store` + Npgsql), Identity (endpoint trong `Program.cs`), ContractApprovals (`Endpoints/ContractApprovalEndpoints.cs`, service đặt trong Infrastructure; riêng phân công SYS-CTR-10 đã chuyển sang mẫu mới). Người chủ trì các module đó tự chuyển khi sẵn sàng; không trộn hai kiểu trong cùng một module.
- **Phân quyền ở BE.** Mỗi permission code trong `PermissionCatalog` là một policy cùng tên; controller dùng `[Authorize(Policy = "<code>")]`. Người thao tác lấy qua `ICurrentActor` (tài khoản phải Active); kiểm tra phạm vi hồ sơ, assignee nằm trong service/repository của module.
- **CSRF cho thao tác ghi.** Action ghi dùng `[RequireCsrf]` (`Api/Filters/`): yêu cầu `X-QTKD-CSRF: 1` và `Origin` thuộc `Cors:Origins`, sai trả 403 `CSRF_REJECTED`.
- **Lỗi nghiệp vụ** dùng `BusinessException(code, status, details)` (đang đặt ở `Domain/Contracts`, dùng chung). Middleware trong `Program.cs` trả JSON `{ ...details, code }`. Module cũ còn `ReviewFailure`, `IdentityFailure`. Lỗi không xác định trả 500 `SYSTEM_ERROR`, không ghi chi tiết exception của provider.
- **Workflow phê duyệt là phần dùng chung.** `Features/Workflows/WorkflowEngine` xử lý chuỗi bước tổng quát; khóa bước, vai trò và trạng thái hồ sơ thuộc adapter của từng loại hồ sơ (hiện chỉ có `ContractApprovals`). Hợp đồng chung `IApprovableDocument` (TASK-056) chưa được hiện thực.
- **Nhật ký truy vết append-only.** Bảng `qtkd.audit_log` chỉ được INSERT; trigger `audit_append_only` chặn UPDATE/DELETE. Module ghi audit trong cùng transaction với thay đổi nghiệp vụ.
- **Module Sprint 2/3 đã có thư mục rỗng** để giữ chỗ và cho thấy ranh giới; không triển khai trước khi được giao.

## Bản đồ module

| Module (BE) | FE feature | Sprint | US / PB | Chủ trì theo kế hoạch | Hiện trạng BE |
| --- | --- | --- | --- | --- | --- |
| `Identity` (Auth, Users, Departments, Roles, Permissions) | `auth`, `users` | 1 | PB-02 | Minh | Có code; Minimal API trong `Program.cs`, EF Core |
| `Audit` | `audit-logs` | 1 | PB-03 | Minh | Có code: API tra cứu UC-CHUNG-06 theo mẫu Controller → Service → Repository (EF Core); xem [list_api-audit.md](../specs/common/list_api-audit.md) |
| `Catalogs` (dịch vụ, nhóm dịch vụ, đơn vị tính, thuế suất) | `catalogs` | 1 | PB-04 | Đan Anh | Giữ chỗ |
| `Customers` | `customers` | 1 (mở rộng S2, S3) | CUS-01, 02, 04, 05, 06, 07 | Hiếu | Giữ chỗ |
| `Areas` | `areas` | 1 (mở rộng S2, S3) | ARE-01, 02, 04, 12, 13 | Tuấn | Giữ chỗ |
| `Contracts` | `contracts` | 1 (phụ lục S2, ký/chấm dứt/gia hạn S3) | CTR-01, 02, 03, 04, 05, 06, 16, 18 | Phong; CTR-04..06: Minh | Có code; Controller + Service + Store Npgsql (kiểu cũ). Đang chuyển sang mẫu mới: trình duyệt (SYS-CTR-04) đã theo Controller → `ContractService` → `IContractRepository`/`ContractRepository` (EF Core LINQ, không SQL) |
| `Approvals` (workflow engine) | `approvals` | 1 (rút hồ sơ, chuyển người duyệt S2) | APR-01..06, 09, 10 | Lộc (BE), Đan Anh (FE tiến độ, cấu hình) | Có code: `Workflows` + `ContractApprovals`; Minimal API. Đang chuyển sang mẫu mới: phân công người duyệt (SYS-CTR-10) đã theo `ApprovalAssignmentsController` → `ApprovalAssignmentService` → `IApprovalAssignmentRepository`/`ApprovalAssignmentRepository` (EF Core; khóa dòng bằng SQL trong repository) |
| `Pricing` (báo giá, bảng giá, phiên bản) | `pricing` | 2 | PRC-01..14 | Xuân, Đan Anh, Hiếu | Giữ chỗ |
| `Outputs` (sản lượng, khóa kỳ) | `outputs` | 2 (mở khóa S3) | OUT-01..07, 13 | Minh | Giữ chỗ |
| `Notifications` (Outbox) | `notifications` | 2 | PB-37 | Lộc, Đan Anh | Hộp thông báo in-app (UC-CHUNG-05); **module mẫu** Controller → Service → Repository (EF Core). Outbox/gửi ngoài chưa có |
| Tác vụ định kỳ | — (`Infrastructure/BackgroundJobs`) | 2 | PB-38 | Phong | Giữ chỗ |
| `Payments` (bảng thanh toán) | `payments` | 3 | PAY-01..15 | Đan Anh, Minh, Hiếu | Giữ chỗ |
| `Signatures` (ký điện tử mô phỏng) | `signatures` | 3 | SIG-01..11, PAY-07, 08 | Lộc | Chưa có thư mục |
| `AiAssistant` | `ai-assistant` | 3 | PB-135 (cần xác nhận với GV) | Xuân | Giữ chỗ |

Các US tra cứu chéo ở Sprint 3 (CUS-08..10, ARE-14, 15, PRC-17) đặt trong module sở hữu dữ liệu được tra cứu hoặc module khởi phát màn hình; không tạo module "Tra cứu" riêng.

Phụ lục hợp đồng (CTR-09..15) dùng chung vòng đời với hợp đồng nên đặt trong `Contracts` khi đến Sprint 2. US-CTR-16 ở Sprint 1 chỉ làm phần hợp đồng.

## Mẫu module (Controller → Service → Repository)

Module mẫu: **Notifications**. Mỗi module mới tạo đúng các file sau. Không thêm lớp phụ (interface cho service, mapper riêng, mỗi DTO một file…) khi chưa thật sự cần.

```
backend/src/
├─ QTKD.Api/Controllers/<Module>/<Module>Controller.cs
│     [ApiController], [Route("api/v1/<module>")], [Authorize(Policy = "<permission>")], [RequireCsrf] cho action ghi.
│     Lấy Actor từ ICurrentActor rồi gọi service. Không chứa nghiệp vụ.
├─ QTKD.Application/
│  ├─ Common/Interfaces/I<Module>Repository.cs     Interface truy cập dữ liệu (+ record trả về nếu cần, vd. NotificationRecord)
│  └─ Features/<Module>/
│     ├─ Dtos/<Module>Dtos.cs                      Mọi request/response của module trong 1 file
│     ├─ Validators/<Module>Validator.cs           Kiểm tra đầu vào, ném BusinessException("VALIDATION", 400, …)
│     └─ Services/<Module>Service.cs               Class cụ thể (không cần interface). Nghiệp vụ, validate, gọi repository,
│                                                  đổi entity → DTO bằng hàm private. Không biết HTTP, không dùng DbContext.
├─ QTKD.Domain/<Module>/<Entity>.cs                Entity + enum của module (enum trùng tên/nhãn với PostgreSQL enum)
└─ QTKD.Infrastructure/
   ├─ Repositories/<Module>Repository.cs           EF Core LINQ trên QtkdDbContext. Trả entity, không trả DTO.
   │                                               Mọi truy vấn lọc theo phạm vi actor (vd. recipient_id).
   └─ Persistence/Configurations/<Module>/         IEntityTypeConfiguration của bảng (Data). Đổi bảng = migration EF.
```

Luồng một request:
1. Controller lấy `Actor` từ `ICurrentActor`.
2. `<Module>Service` validate đầu vào và áp quy tắc nghiệp vụ.
3. `I<Module>Repository` đọc/ghi qua `QtkdDbContext`.
4. Service đổi entity thành DTO.
5. Controller trả JSON.

Đăng ký DI:
- Repository: thêm `services.AddScoped<I<Module>Repository, <Module>Repository>()` trong `QtkdPersistence.AddQtkdPersistence` (`Infrastructure/Persistence/QtkdPersistence.cs`).
- Service: thêm `builder.Services.AddScoped<<Module>Service>()` trong `Program.cs`.

Phần dùng chung, module không tự viết lại:
- Middleware lỗi trong `Program.cs`: `BusinessException` → JSON `{ ...details, code }`.
- `[RequireCsrf]` (`Api/Filters`).
- `ICurrentActor` (`Api/Authentication`).
- `QtkdDbContext`.

Khi cần khóa dòng (`SELECT … FOR UPDATE`) hoặc SQL đặc thù, repository được dùng `FromSql`/`ExecuteSql` của EF hoặc `PgDatabase`. Phần đó vẫn nằm trong `<Module>Repository` và giữ nguyên interface như trên.

## Truy cập dữ liệu

| Cách | Dùng ở | Ghi chú |
| --- | --- | --- |
| EF Core (`IdentityDbContext`) | Identity | Map một phần bảng Identity; không sinh migration |
| EF Core (`QtkdDbContext`) | Toàn schema; Notifications | Sở hữu migration; LINQ cho notifications |
| EF Core LINQ trong `Infrastructure/Repositories/<Module>Repository.cs` | Notifications; Contracts – trình duyệt (SYS-CTR-04); ContractApprovals – phân công (SYS-CTR-10) | **Mặc định cho module mới** |
| Npgsql qua `PgDatabase` (tham số `$1, $2…`) | Contracts | Kiểu cũ; module mới chỉ dùng bên trong repository khi LINQ không đủ |
| Npgsql trực tiếp (`PostgresApprovalStore.Command`, tham số có tên) | ContractApprovals | Có khóa dòng `SELECT … FOR UPDATE`, idempotency |

Khi đổi bảng phải sửa entity/configuration trong `Infrastructure/Persistence` (tạo migration EF) và code đọc/ghi tương ứng; chạy `npm run check` trong `DB/` để so model với SQL. SQL viết tay và mapping EF không được kiểm tra lúc build; lệch schema chỉ lộ khi chạy hoặc qua test PostgreSQL.

## Kiểm thử

- `tests/QTKD.UnitTests/<Module>/`: logic thuần của Application/Domain: validator, quy tắc, và `<Module>ServiceTests` dùng repository giả (xem `Notifications/NotificationServiceTests.cs`). Không HTTP, DB hay mạng.
- `tests/QTKD.IntegrationTests/<Module>ApiTests.cs`: `ApiFactory` chạy pipeline thật (JWT, policy, controller, CSRF) trên SQLite. Repository thay bằng spy qua thuộc tính của `ApiFactory` (`NotificationRepository`; module cũ: `ApprovalStore`…); `ICurrentActor` được thay bằng `SqliteCurrentActor` vì bản thật đọc PostgreSQL. Mức này kiểm tra hợp đồng API, không kiểm tra SQL.
- `tests/QTKD.IntegrationTests/<Module>RepositorySqliteTests.cs`: chạy LINQ của repository trên SQLite in-memory với `QtkdDbContext` (xem `NotificationRepositorySqliteTests.cs`). Không chứng minh phần riêng của PostgreSQL (enum, khóa dòng).
- SQL thật: `*PostgresRollbackTests` chạy trong một transaction luôn rollback, bật bằng `QTKD_APPROVAL_ROLLBACK_CONNECTION`; cả suite trên DB Supabase riêng cho test bật bằng `QTKD_TEST_DATABASE_CONNECTION` kèm `QTKD_TEST_DATABASE_IS_DISPOSABLE=true`. Không đặt biến thì các test này bị skip.

## Thư mục đang dùng

| Đường dẫn | Vai trò |
| --- | --- |
| frontend/src/features/ | Feature FE, gồm auth API và các màn nghiệp vụ prototype |
| frontend/src/lib/http/client.ts | Transport fetch, access token trong bộ nhớ, refresh/logout coordination |
| frontend/src/app/router/BusinessRoute.tsx | Ngăn mount màn nghiệp vụ mock với danh tính API |
| backend/src/QTKD.Api/ | Composition root, JWT, policy, middleware lỗi; `Controllers/`, `Endpoints/` (Minimal API cũ), `Filters/`, `Authentication/` |
| backend/src/QTKD.Application/ | `Common/Interfaces/` (interface repository) và `Features/<Module>/` (Dtos, Validators, Services) |
| backend/src/QTKD.Domain/ | Entity, enum, quy tắc theo module |
| backend/src/QTKD.Infrastructure/ | `Repositories/` (repository EF Core theo module), `Persistence/` (`QtkdDbContext`, `Configurations/`, `Schema/`, `Migrations/`, `Seed/`, PgDatabase và store Postgres cũ, IdentityDbContext), `Identity/`, `ContractApprovals/` |
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
3. BE theo [mẫu module](#mẫu-module-controller--service--repository), lấy Notifications làm bản mẫu:
   - `Domain/<Module>/<Entity>.cs`: entity + enum. Nếu có bảng mới: thêm configuration trong `Persistence/Configurations/<Module>/` rồi tạo migration EF.
   - `Application/Common/Interfaces/I<Module>Repository.cs`.
   - `Application/Features/<Module>/Dtos/<Module>Dtos.cs`, `Validators/<Module>Validator.cs`, `Services/<Module>Service.cs`.
   - `Infrastructure/Repositories/<Module>Repository.cs` dùng `QtkdDbContext`. Thao tác có ghi audit thì INSERT `qtkd.audit_log` trong cùng transaction.
   - `Api/Controllers/<Module>/<Module>Controller.cs` với `[Authorize(Policy = …)]`, `ICurrentActor`, `[RequireCsrf]` cho action ghi. Permission mới thêm vào `PermissionCatalog`, migration grants và `demo-seed.json`.
   - DI: repository trong `QtkdPersistence.AddQtkdPersistence`, service trong `Program.cs`.
4. Test:
   - `UnitTests/<Module>/`: validator và `<Module>ServiceTests` với repository giả.
   - `IntegrationTests/<Module>ApiTests.cs`: spy repository (thêm thuộc tính override vào `ApiFactory`, như `NotificationRepository`).
   - `IntegrationTests/<Module>RepositorySqliteTests.cs` cho LINQ.
   - Nếu có SQL hoặc khóa dòng thật: `<Module>PostgresRollbackTests.cs`.
5. FE: tạo `features/<module>/{api,components,hooks,pages,types}` và khai báo route trong `app/router`.
6. Nếu hồ sơ cần phê duyệt: dùng `WorkflowEngine` qua adapter của loại hồ sơ, thêm loại hồ sơ vào cấu hình quy trình. Không viết luồng duyệt riêng trong module.
7. Docs: tạo `docs/specs/<module>/`.
