# BE: C#/.NET Web API

Khung thư mục theo TASK-049 (Api / Application / Domain / Infrastructure). Chưa có solution, project file hay source. Phiên bản .NET chưa chốt. Bản đồ module chung xem tại [docs/architecture/STRUCTURE.md](../docs/architecture/STRUCTURE.md).

## Cây thư mục

```text
BE/
  src/
    QTKD.Api/                      Tầng trình bày HTTP
      Controllers/<Module>/        Mỗi module một thư mục controller
      Authorization/               Policy theo vai trò/quyền, kiểm tra phạm vi hồ sơ
      Middlewares/                 Xử lý lỗi tập trung, correlation id
      Filters/                     Idempotency-Key (submit), validate model
      Extensions/                  Đăng ký DI, Swagger, JWT
    QTKD.Application/              Use case, không phụ thuộc EF/HTTP
      Common/
        Interfaces/                Abstraction cho DbContext, current user, clock, file storage
        Models/                    Phân trang, kết quả, lỗi nghiệp vụ dùng chung
        Exceptions/                Lỗi nghiệp vụ, không tìm thấy, xung đột phiên bản
      Features/<Module>/           Dtos / Services / Validators cho mỗi module
    QTKD.Domain/                   Entity, enum, quy tắc bất biến của từng module
      Common/                      Entity cơ sở, trường audit, concurrency token
      <Module>/
    QTKD.Infrastructure/           Cài đặt kỹ thuật
      Persistence/
        Configurations/<Module>/   Cấu hình EF Core theo entity
        Interceptors/              Audit SaveChanges interceptor (TASK-024)
        Migrations/                EF Core migration (xem DB/README.md)
        Seed/                      Seed danh mục, tài khoản mẫu 6 phòng ban
      Identity/                    Phát JWT, hash mật khẩu
      Storage/                     Lưu tệp đính kèm hợp đồng
      Messaging/                   Sprint 2: Outbox thông báo
      BackgroundJobs/              Sprint 2: job theo ngày (CTR-05, nhắc hạn)
      ExternalServices/            Sprint 3: tích hợp dịch vụ bên ngoài, retry/callback
  tests/
    QTKD.UnitTests/<Module>/       Unit test rule theo module
    QTKD.IntegrationTests/
      Api/                         Test endpoint, 401/403, idempotency
      Persistence/                 Test ràng buộc DB, đồng thời
```

## Module Sprint 1 và vị trí làm việc

| Module | Thư mục chính | Task |
| --- | --- | --- |
| Identity | `Controllers/Identity`, `Features/Identity/{Auth,Users,Departments,Roles,Permissions}`, `Domain/Identity`, `Infrastructure/Identity` | TASK-022, 023 |
| Audit | `Features/Audit`, `Domain/Audit`, `Persistence/Interceptors` | TASK-024 |
| Catalogs | `Features/Catalogs/{Services,ServiceGroups,Units,TaxRates}`, `Domain/Catalogs` | TASK-033 |
| Customers | `Controllers/Customers`, `Features/Customers`, `Domain/Customers` | TASK-013..015, 018, 020 |
| Areas | `Controllers/Areas`, `Features/Areas`, `Domain/Areas` | TASK-040..042, 045 |
| Contracts | `Controllers/Contracts`, `Features/Contracts`, `Domain/Contracts`, `Infrastructure/Storage` | TASK-026, 060..062, 065, 067 |

## Gợi ý đặt tên file khi triển khai

Ví dụ cho module Customers; module khác làm tương tự.

```text
Controllers/Customers/CustomersController
Features/Customers/Dtos/        CreateCustomerRequest, UpdateCustomerRequest, CustomerSearchQuery,
                                CustomerListItem, CustomerDetail, ChangeCustomerStatusRequest
Features/Customers/Services/    ICustomerService, CustomerService
Features/Customers/Validators/  CreateCustomerValidator, UpdateCustomerValidator
Domain/Customers/               Customer, CustomerStatus
Persistence/Configurations/Customers/CustomerConfiguration
tests/QTKD.UnitTests/Customers/ CustomerRulesTests
```

Nếu nhóm chọn MediatR/CQRS, thay `Services/` bằng `Commands/` và `Queries/` cho mọi module cùng lúc, ghi lại trong `docs/decisions/`.

## Quy ước

- Kiểm tra quyền, phạm vi hồ sơ và assignee ở BE. Ẩn nút ở FE không thay thế kiểm tra này.
- Module không truy cập trực tiếp entity của module khác để ghi dữ liệu; dùng service/interface công khai (ví dụ lookup khách hàng Active, khu vực Active cho hợp đồng).
- Không đưa connection string, JWT secret, Supabase key vào Git. Dùng file local đã có trong `.gitignore`.
