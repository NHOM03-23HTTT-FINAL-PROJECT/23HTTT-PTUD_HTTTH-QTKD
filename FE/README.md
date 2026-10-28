# FE: React + TypeScript + Vite

Khung thư mục theo TASK-031, 032. Chưa có `package.json`, cấu hình Vite hay source. Phiên bản Node.js và thư viện chưa chốt. Bản đồ module chung xem tại [docs/architecture/STRUCTURE.md](../docs/architecture/STRUCTURE.md).

## Cây thư mục

```text
FE/
  public/                          Tài nguyên tĩnh
  src/
    app/
      router/                      Khai báo route, guard theo quyền
      providers/                   Provider toàn cục (auth, query, theme)
    layouts/                       Layout đăng nhập, layout chính với menu theo quyền
    components/                    Component dùng chung (TASK-032)
      data-table/                  Bảng có phân trang, sắp xếp, lọc
      form/                        Trường nhập, validate, form CRUD
      file-upload/                 Tải lên / tải xuống tệp đính kèm
      status-badge/                Badge trạng thái hồ sơ
      feedback/                    Thông báo, xác nhận, nhập lý do
    lib/
      http/                        Axios instance, JWT interceptor, xử lý 401/403
      auth/                        Lưu token, đọc quyền người dùng hiện tại
    config/                        Đọc biến môi trường (URL API)
    constants/                     Mã quyền, trạng thái, đường dẫn route
    hooks/                         Hook dùng chung
    types/                         Kiểu dữ liệu dùng chung (phân trang, lỗi API)
    utils/                         Hàm định dạng ngày, tiền, mã
    assets/                        Ảnh, icon
    styles/                        Style toàn cục, token theo Figma
    features/<feature>/            Mỗi module nghiệp vụ một thư mục
      api/                         Gọi API của module
      components/                  Component riêng của module
      hooks/                       Hook riêng của module
      pages/                       Màn hình gắn với route
      types/                       Kiểu DTO của module
  tests/                           Thiết lập test chung
```

## Feature Sprint 1

| Feature | Màn hình dự kiến | Task |
| --- | --- | --- |
| `auth` | Đăng nhập, đăng xuất | TASK-025 |
| `users` | Quản lý người dùng, phòng ban, vai trò, quyền | TASK-025 |
| `audit-logs` | Tra cứu nhật ký theo hồ sơ | PB-03 |
| `catalogs` | Danh mục dịch vụ, nhóm dịch vụ, đơn vị tính, thuế suất | TASK-034 |
| `customers` | Danh sách + tìm kiếm, form tạo/sửa, chi tiết (tab HĐ / bảng giá / bảng TT), tạm ngưng / kích hoạt | TASK-016, 017, 019 |
| `areas` | Cây khu vực, form tạo/sửa, tìm kiếm, chi tiết | TASK-043, 044 |
| `contracts` | Danh sách, chi tiết, form tạo/sửa có đính kèm, trình duyệt / hủy dự thảo, rà soát theo cấp | TASK-027, 063, 064, 066 |
| `approvals` | Cấu hình quy trình, hồ sơ chờ tôi xử lý, timeline tiến độ, lịch sử lượt duyệt | TASK-036, 037 |

`approvals/components` chứa phần dùng lại cho mọi loại hồ sơ (timeline tiến độ, panel approve / reject / yêu cầu sửa kèm ý kiến). `contracts` dùng lại các component này, không tự viết lại luồng duyệt.

Feature Sprint 2/3 đã có thư mục giữ chỗ: `pricing`, `outputs`, `notifications`, `payments`, `signatures`, `ai-assistant`. Khi triển khai, tạo các thư mục con giống feature Sprint 1.

## Gợi ý đặt tên file khi triển khai

Ví dụ cho `customers`:

```text
features/customers/api/         customersApi
features/customers/pages/       CustomerListPage, CustomerFormPage, CustomerDetailPage
features/customers/components/  CustomerSearchForm, CustomerStatusDialog, CustomerRelatedTabs
features/customers/hooks/       useCustomers, useCustomerDetail
features/customers/types/       customer
```

## Quy ước

- Feature chỉ import từ feature khác qua phần được công khai (ví dụ component của `approvals`), không import file nội bộ.
- Ẩn menu/nút theo quyền chỉ để hiển thị; BE vẫn là nơi quyết định quyền.
- Không ghi URL môi trường thật hay token vào source; dùng `.env.example` khi có cấu hình.
