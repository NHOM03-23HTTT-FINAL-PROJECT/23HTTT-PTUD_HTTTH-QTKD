# FE: React + TypeScript + Vite

Khung thư mục theo TASK-031, 032. Bản đồ module chung xem tại [docs/architecture/STRUCTURE.md](../docs/architecture/STRUCTURE.md).

## Prototype hiện có

Prototype tương tác theo Figma "PTUD ERP – App shell & Dashboard theo vai trò", page **04 · Dùng chung (CHUNG)**. Chưa có API/BE/DB: dữ liệu mẫu nằm trong `src/mocks/`, trạng thái giả lập (bộ đếm sai mật khẩu, thời điểm khóa, lần đăng nhập trước) lưu ở localStorage key `qtkd.mock.v1`.

Phiên bản dùng cho prototype: React 18.3.1, React Router 6.28.0, Vite 5.4.11, TypeScript 5.6.3 (đã chạy với Node.js 24). Đây là lựa chọn khi dựng prototype, nhóm vẫn cần chốt phiên bản chính thức.

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # kiểm tra kiểu + build production
```

### UC-CHUNG-01 · Đăng nhập

| Frame Figma | Cách xem |
| --- | --- |
| 01.0 Mở hồ sơ từ đường dẫn | Chưa đăng nhập, mở `/hop-dong/HD-2026-013?src=email` |
| 01.1 Biểu mẫu đăng nhập | `/dang-nhap` |
| 01.2 Thiếu thông tin (E1) | Bấm "Đăng nhập" khi để trống |
| 01.3 Sai thông tin (E2) | Nhập sai mật khẩu; hiển thị số lần thử còn lại |
| 01.4 Tạm khóa (E2.2/E3) | Sai 5 lần liên tiếp, hoặc đăng nhập `quan.tm` (khóa sẵn) |
| 01.5 Vô hiệu hóa (E4) | `tuan.lv` |
| 01.6 Chưa phân quyền (E5) | `thao.nt` hoặc `khoa.pv` |
| 01.7 Lỗi hệ thống (E6) | `test.loi` |
| 01.8 Đang xử lý | Trạng thái trong ~0,9 giây sau khi bấm "Đăng nhập" |
| 01.9 Không có quyền (A3) | Đăng nhập `an.nv` từ `/bang-thanh-toan/BTT-2026-0076` |
| 05.1 → 05.6 Trang làm việc theo vai trò | `an.nv`, `son.vt`, `ha.bt`, `duc.pm`, `bao.tq`, `lan.nt` |

### UC-CHUNG-02 · Quên mật khẩu

Bấm "Quên mật khẩu?" trên màn đăng nhập (`/quen-mat-khau`). Chưa có dịch vụ email nên mã OTP hiện trong ô "Hộp thư giả lập" dưới form; ô này chỉ xuất hiện khi mã thật sự được "gửi".

| Frame Figma | Cách xem |
| --- | --- |
| 02.1 / 02.2 Nhập tài khoản, lỗi E1 | Để trống, hoặc nhập email sai định dạng (`an.nguyen@abc`) |
| 02.3 Nhập mã OTP | Nhập `an.nv`; "Gửi lại mã" mở sau 60 giây |
| 02.4 Mã không chính xác (E4) | Nhập sai mã; hiển thị số lần thử còn lại |
| 02.5 Mã hết hạn (E5) | Chờ quá 5 phút |
| 02.6 Chưa gửi được mã (E3) | `test.loi` – lần gửi đầu lỗi, gửi lại thì thành công |
| 02.7 Tạm ngưng 15 phút (E6/E7) | Sai mã 5 lần, hoặc gửi lại lần thứ 4 trong 15 phút |
| 02.8 / 02.9 Mật khẩu mới, lỗi E8 | Chỉ báo độ mạnh + chính sách; nhập lại `Abc@12345` để thấy lỗi trùng mật khẩu hiện tại |
| 02.10 Không đặt lại được (E9) | `test.loi` – lần lưu đầu lỗi, thử lại thì thành công |
| 02.11 Thành công | Quay về đăng nhập, điền sẵn tài khoản; mật khẩu cũ hết hiệu lực, phiên cũ bị đăng xuất, tài khoản đang khóa được mở |

Tài khoản không tồn tại hoặc bị vô hiệu hóa vẫn nhận thông báo chung "Nếu tài khoản tồn tại…" nhưng không có mã (E2). Tiêu chí "Không trùng mật khẩu hiện tại" chỉ server kiểm tra được, nên hiển thị trạng thái chờ cho tới khi bấm "Đặt lại mật khẩu".

### UC-CHUNG-03 · Đăng xuất

| Frame Figma | Cách xem |
| --- | --- |
| 03.0 Menu tài khoản | Bấm avatar trên Topbar |
| 03.1 Xác nhận khi có dữ liệu chưa lưu (A1) | Vào một trang "Tạo …" (ví dụ `/khach-hang/tao-moi`), nhập vào ô "Thử dữ liệu chưa lưu", rồi chọn Đăng xuất |
| 03.2 Cảnh báo phiên sắp hết hạn | Không thao tác tới khi còn 2 phút |
| 03.3 Đăng xuất thành công | Menu tài khoản → Đăng xuất |
| 03.4 Phiên đã hết hạn (A2) | Hết thời gian không thao tác; đăng nhập lại sẽ quay về trang đang làm |
| 03.5 Phiên bị thu hồi (A3) | Đăng nhập ở một tab (không ghi nhớ), đặt lại mật khẩu cùng tài khoản ở tab khác, rồi quay lại tab đầu và chuyển trang |

Thời gian phiên mặc định 30 phút. Để thử nhanh, tạo `frontend/.env.local` từ `.env.example` và đặt `VITE_SESSION_IDLE_MINUTES=3` (cảnh báo hiện sau 1,5 phút), rồi chạy lại `npm run dev`. Phiên được kiểm tra lại mỗi lần chuyển trang hoặc quay lại tab, thay cho "request tiếp theo" khi chưa có API.

Ô "Thử dữ liệu chưa lưu" chỉ có trong prototype; biểu mẫu thật gọi `useUnsavedChanges(mô tả | null)` từ `app/providers/SessionProvider`.

### UC-CHUNG-04 · Đổi mật khẩu

Menu tài khoản → Đổi mật khẩu (`/doi-mat-khau`).

| Frame Figma | Cách xem |
| --- | --- |
| 04.1 Biểu mẫu đổi mật khẩu | Độ mạnh và chính sách cập nhật khi gõ; "Khác mật khẩu hiện tại" so ngay với ô mật khẩu hiện tại |
| 04.2 Thông tin chưa hợp lệ (E1/E3) | Bấm "Lưu" khi để trống, mật khẩu yếu hoặc xác nhận không khớp |
| 04.3 Mật khẩu hiện tại sai (E2) | Nhập sai mật khẩu hiện tại; giữ mật khẩu mới đã nhập |
| 04.4 Không đổi được (E4) | `test.luu` – lần lưu đầu lỗi, thử lại thì thành công |
| 04.5 Thành công | Biểu mẫu được làm trống, cập nhật "Đổi mật khẩu gần nhất"; phiên hiện tại giữ nguyên, phiên ở tab/thiết bị khác bị đăng xuất (03.5) |
| 04.6 Bắt buộc đổi lần đầu (A1) | `linh.pt` / `TamThoi@2026`: chỉ vào được màn đổi mật khẩu, không có Sidebar |
| 04.7 Tạm khóa do sai 5 lần | Sai mật khẩu hiện tại 5 lần liên tiếp → bị đăng xuất, tài khoản khóa 15 phút |

Sai mật khẩu hiện tại dùng chung bộ đếm với đăng nhập (UC-CHUNG-01), nên các lần sai ở hai nơi cộng dồn.

### Tài khoản mẫu

Mọi tài khoản mẫu dùng mật khẩu kiểm thử `Abc@12345` (trừ `linh.pt` dùng mật khẩu tạm `TamThoi@2026`, và tài khoản đã đổi/đặt lại mật khẩu); có thể đăng nhập bằng tên đăng nhập hoặc email (`an.nv@abc.vn`). Danh sách đầy đủ ở `src/mocks/seed/users.ts`. Xóa key `qtkd.mock.v1` trong localStorage để khôi phục dữ liệu mẫu ban đầu (gồm cả mật khẩu đã đặt lại).

"Thông tin cá nhân", "Đổi mật khẩu" và "Đăng xuất" nằm trong menu tài khoản khi bấm avatar trên Topbar (frame 03.0); Sidebar chỉ còn menu nghiệp vụ. Các mục menu thuộc UC khác (khách hàng, hợp đồng, khu vực, phê duyệt, quản trị, thông tin cá nhân) hiện là trang giữ chỗ.

## Cây thư mục

```text
frontend/
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
