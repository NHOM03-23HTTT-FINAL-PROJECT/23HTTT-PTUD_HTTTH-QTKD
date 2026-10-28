# DB: PostgreSQL (Supabase)

Thư mục tài nguyên cơ sở dữ liệu. Chưa có schema, migration hay seed.

## Đề xuất nguồn schema (cần nhóm chốt)

Kế hoạch nêu EF Core migration (TASK-049) nhưng chưa chốt nơi lưu. Bộ khung đề xuất:

- **Nguồn schema chuẩn:** EF Core migration tại `BE/src/QTKD.Infrastructure/Persistence/Migrations/`.
- **DB/** không chứa bộ DDL tạo bảng song song, chỉ chứa thiết kế, seed demo, script tiện ích và tài liệu.

Nếu nhóm chọn cách khác, ghi quyết định vào `docs/decisions/` và cập nhật README này.

## Cây thư mục

```text
DB/
  erd/              ERD toàn hệ thống (TASK-030), ảnh xuất và file nguồn công cụ vẽ
  seeds/            Dữ liệu demo MVP1: danh mục, khách hàng, khu vực 3 cấp (TASK-047)
  scripts/          Truy vấn kiểm tra, reset DB local; không chạy trên DB dùng chung khi chưa được giao
  data-dictionary/  Mô tả bảng, cột, ràng buộc theo module
```

## Nhóm bảng theo module

| Module | Bảng theo kế hoạch | Task |
| --- | --- | --- |
| Identity | user, department, role, permission và bảng liên kết | TASK-022, 023 |
| Audit | audit_log (append-only) | TASK-024 |
| Catalogs | service, service_group, unit, tax_rate | TASK-033 |
| Customers | customer (unique mã, MST) | TASK-013 |
| Areas | area (cây cha-con, cấp, loại, quy chuẩn kỹ thuật, trạng thái) | TASK-040 |
| Contracts | contract, contract_attachment | TASK-060 |
| Approvals | workflow_definition, workflow_step, workflow_instance, workflow_task, approval_action | TASK-052 |

Tên bảng lấy theo Sprint Backlog; tên cột và ràng buộc chi tiết chốt theo ERD.

## Lưu ý

- Không đưa mật khẩu, connection string hoặc Supabase service key vào Git.
- Tài khoản mẫu 6 phòng ban dùng mật khẩu chỉ cho môi trường local/demo, cấp qua cấu hình local, không ghi mật khẩu thật vào seed.
