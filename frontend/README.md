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
| 03.1 Xác nhận khi có dữ liệu chưa lưu (A1) | Nhập dữ liệu vào biểu mẫu "Tạo khách hàng" (`/khach-hang/tao-moi`) hoặc ô "Thử dữ liệu chưa lưu" ở một trang "Tạo …" khác, rồi chọn Đăng xuất |
| 03.2 Cảnh báo phiên sắp hết hạn | Không thao tác tới khi còn 2 phút |
| 03.3 Đăng xuất thành công | Menu tài khoản → Đăng xuất |
| 03.4 Phiên đã hết hạn (A2) | Hết thời gian không thao tác; đăng nhập lại sẽ quay về trang đang làm |
| 03.5 Phiên bị thu hồi (A3) | Đăng nhập ở một tab (không ghi nhớ), đặt lại mật khẩu cùng tài khoản ở tab khác, rồi quay lại tab đầu và chuyển trang |

Thời gian phiên mặc định 30 phút. Để thử nhanh, tạo `frontend/.env.local` từ `.env.example` và đặt `VITE_SESSION_IDLE_MINUTES=3` (cảnh báo hiện sau 1,5 phút), rồi chạy lại `npm run dev`. Phiên được kiểm tra lại mỗi lần chuyển trang hoặc quay lại tab, thay cho "request tiếp theo" khi chưa có API.

Ô "Thử dữ liệu chưa lưu" chỉ có trong prototype trên các trang "Tạo …" chưa làm; biểu mẫu thật (ví dụ Tạo khách hàng) gọi `useUnsavedChanges(mô tả | null)` từ `app/providers/SessionProvider`.

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

### UC-CUS-01 · Tạo hồ sơ khách hàng

Page **02 · Khách hàng (CUS)** trên Figma. Đăng nhập `an.nv` (Nhân viên Kinh doanh), chọn "Tạo khách hàng" ở Sidebar (`/khach-hang/tao-moi`). Tài khoản không có quyền `customers.create` (ví dụ `hong.lt` – Trưởng phòng Kinh doanh) bị chuyển về trang làm việc kèm cảnh báo không có quyền.

| Frame Figma | Cách xem |
| --- | --- |
| 01.1 Biểu mẫu tạo khách hàng | Mở trang; mã KH, trạng thái Hoạt động và nhân viên phụ trách (người tạo) chỉ đọc |
| 01.2 Lỗi kiểm tra dữ liệu (A5.1/A5.2/A5.4) | Bấm "Lưu" khi tên/người đại diện chỉ có khoảng trắng, MST 9 chữ số, điện thoại `09012a4567`, email `lienhe@minhphat` |
| 01.3 Chưa có phương thức liên hệ (A5.5) | Nhập đủ trường bắt buộc nhưng để trống cả điện thoại và email |
| 01.4 Mã số thuế đã tồn tại (A5.3/A5.6) | MST `0312345678` (KH-000245, đang Tạm ngưng) hoặc `0301234567` (KH-000198, Hoạt động); "Mở hồ sơ hiện có" mở hồ sơ trùng |
| 01.5 Xác nhận rời biểu mẫu (A4) | Bấm "Hủy" (hoặc "Mở hồ sơ hiện có") khi đã nhập; chưa nhập gì thì rời ngay |
| 01.6 Tạo không thành công (A6.3) | MST bắt đầu bằng `0399` (ví dụ `0399000001`): lần lưu đầu lỗi và được hoàn tác, "Kiểm tra kết quả và thử lại" thì lưu được |
| 01.6 Mất kết nối (A6.4) | MST bắt đầu bằng `0388`: hồ sơ đã lưu nhưng phản hồi bị mất; thử lại nhận đúng hồ sơ đã tạo, không tạo trùng |
| 01.6 Bấm Lưu nhiều lần (A6.2) | Nút khóa khi đang lưu; mỗi biểu mẫu gửi kèm một Idempotency-Key nên server chỉ xử lý một lần |
| 01.7 Tạo thành công | Lưu dữ liệu hợp lệ → mã tăng dần từ `KH-000312`, chuyển sang trang hồ sơ `/khach-hang/:ma` kèm thông báo và lịch sử tạo |

Phiên hết hạn hoặc bị thu hồi khi bấm "Lưu" (A2) dùng chung luồng đăng xuất của UC-CHUNG-03. Khách hàng mẫu nằm ở `src/mocks/seed/customers.ts`, khách tạo mới lưu cùng localStorage key `qtkd.mock.v1`. Danh mục nhóm khách hàng/nhóm dịch vụ trong seed chỉ là dữ liệu mẫu, danh mục thật thuộc TASK-034.

Sau khi lưu, hệ thống chuyển sang trang hồ sơ (UC-CUS-06).

### UC-CUS-02 · Cập nhật thông tin khách hàng

Mở một hồ sơ (ví dụ `/khach-hang/KH-000311`) → "Chỉnh sửa thông tin" (`/khach-hang/:ma/chinh-sua`). Quyền `customers.update` có ở Nhân viên và Trưởng phòng Kinh doanh. Mã KH, MST, trạng thái, nhân viên phụ trách chỉ đọc; trường khác bản đang lưu được gắn "Đã sửa" và tóm tắt trước → sau ở thẻ "Thay đổi chưa lưu"; lý do/căn cứ là bắt buộc.

| Frame Figma | Cách xem |
| --- | --- |
| 02.1 Biểu mẫu chỉnh sửa | Sửa địa chỉ, điện thoại, thêm nhóm dịch vụ |
| 02.2 Không hợp lệ (A5.1) | Xóa người đại diện, email `kehoach@@pvphuongnam.vn`, để trống lý do rồi lưu |
| 02.3 Không còn phương thức liên hệ (A5.2) | Nhập lý do, xóa cả điện thoại và email |
| 02.4 Người khác đã cập nhật (A5.3) | Sửa `KH-000198` rồi lưu: "Trần Minh Quân" lưu phiên bản 2 ngay trước đó (chỉ một lần). "Tải lại bản mới nhất và đối chiếu" giữ thay đổi của bạn ở trường người khác không sửa, trường cả hai cùng sửa lấy theo bản mới; phải bấm lưu lại. Cũng thử được bằng hai tab cùng sửa một hồ sơ |
| 02.5 Xác nhận hủy (A3.5) | Bấm "Hủy" khi đã sửa; chưa sửa gì thì về hồ sơ ngay |
| 02.6 Không có thay đổi (A6.1) | Bấm "Lưu thay đổi" khi chưa sửa; không tăng phiên bản, không ghi lịch sử |
| 02.7 Khách đang Tạm ngưng | Sửa `KH-000245`; trạng thái Tạm ngưng giữ nguyên |
| 02.8 Lỗi lưu (A6.2) | Sửa `KH-000289`: lần lưu đầu của biểu mẫu lỗi và hoàn tác, "Kiểm tra kết quả và thử lại" thì lưu được |
| 02.8 Mất kết nối (A6.3) | Sửa `KH-000301`: đã ghi nhưng mất phản hồi; thử lại nhận đúng kết quả cũ, không ghi lịch sử trùng |
| 02.9 Cập nhật thành công | Về trang hồ sơ: phiên bản tăng, trường vừa sửa có nhãn "Mới cập nhật", lịch sử thay đổi ghi trường, giá trị trước/sau, lý do, người và thời điểm |

Server giả lập kiểm tra lại phiên bản đang sửa, quyền, trường chỉ đọc (A5.4) và dữ liệu trước khi ghi. Phạm vi khách hàng theo người phụ trách (A5.5) chưa có quy tắc trong đặc tả nên prototype chưa giới hạn.

### UC-CUS-03 · Tạm ngưng / UC-CUS-04 · Kích hoạt lại khách hàng

Chỉ Trưởng phòng Kinh doanh (`hong.lt`, quyền `customers.change-status`). Trên trang hồ sơ, bấm mũi tên của nút "Chỉnh sửa thông tin ▾" (03.0 / 04.0); Nhân viên KD vẫn có menu này nhưng chỉ có mục "Cập nhật thông tin". Tệp căn cứ chỉ lưu tên và dung lượng, chưa tải lên máy chủ.

| Frame Figma | Cách xem |
| --- | --- |
| 03.1 → 03.2 → 03.5 → 03.6 | `KH-000276` (Vận tải Hoàng Long): nhập lý do → "Tiếp tục rà soát" → chọn hướng xử lý cho 4 hồ sơ → "Xác nhận tạm ngưng". Thông báo Pháp chế gửi lỗi, hiển thị "Chờ gửi lại" (A9) |
| 03.3 Thiếu lý do (A3) | Bấm "Tiếp tục rà soát" khi chưa chọn nhóm lý do/nhập nội dung |
| 03.4 Không tải đủ dữ liệu rà soát (A4.4) | `KH-000310`: danh sách công việc từ Khai thác lỗi ở lần rà soát đầu, nút xác nhận bị khóa tới khi "Tải lại kết quả rà soát" |
| 03.7 Đã Tạm ngưng (A2) | Mở `/khach-hang/KH-000245/tam-ngung` khi khách đang Tạm ngưng: về hồ sơ kèm thông báo, không ghi thêm lịch sử |
| 03.8 Không thành công (A8.1 / A8.2) | `KH-000305`: lần xác nhận đầu lỗi lưu và hoàn tác; `KH-000311`: đã ghi nhưng mất phản hồi. "Kiểm tra kết quả và thử lại" không ghi trùng |
| 03.8 Dữ liệu đã đổi (A7.1) | Mở thao tác ở hai tab; sửa hồ sơ ở tab kia rồi xác nhận tạm ngưng |
| 04.1 Đủ điều kiện | `KH-000233`: ba điều kiện đã có xác nhận; nhập lý do, tải căn cứ, xác nhận |
| 04.2 Chưa đủ điều kiện (A4.1 / A4.2) | `KH-000245`: công nợ chưa có xác nhận của Kế toán → khóa xác nhận. Vận hành/tranh chấp chưa giải quyết không có lối ngoại lệ |
| 04.3 Quyết định ngoại lệ (A4.3) | `KH-000245` → "Ghi nhận quyết định ngoại lệ" (số quyết định + nội dung chấp thuận) |
| 04.4 Thiếu lý do / căn cứ (A5) | Bấm "Xác nhận kích hoạt lại" khi trống lý do hoặc chưa tải căn cứ |
| 04.5 Kích hoạt lại thành công | Hồ sơ hiển thị quyết định, hồ sơ đã hết hiệu lực/đã hủy giữ nguyên trạng thái, thông báo các bộ phận |
| 04.6 Không tải được thông tin tạm ngưng (A2.1) | `KH-000258`: lần mở đầu lỗi, "Tải lại" thì xem được |

Khách hàng tạm ngưng trong prototype (không có xác nhận mẫu) có điều kiện ứng với nhóm lý do là "Chưa đạt": công nợ → công nợ, vi phạm/tranh chấp → tranh chấp, vận hành → vận hành; nhóm khác không chặn. Danh sách hồ sơ bị ảnh hưởng, hướng xử lý và quy tắc này chỉ là dữ liệu mẫu (`src/mocks/seed/customerStatus.ts`), cần đối chiếu đặc tả khi có BE.

### UC-CUS-05 · Tìm khách hàng

Sidebar → "Danh sách khách hàng" (`/khach-hang`). Từ khóa, trạng thái, sắp xếp, trang và số dòng lưu trên URL (`?q=…&trang-thai=all&sap-xep=name-asc&trang=2&so-dong=20`), nên quay lại từ hồ sơ vẫn giữ điều kiện.

| Frame Figma | Cách xem |
| --- | --- |
| 05.1 Danh sách mặc định | Mở trang: khách Hoạt động, cập nhật gần nhất trước, 8 dòng/trang |
| 05.2 Tìm theo từ khóa (A3.2 / A3.3) | `minh phát` + "Tất cả": khớp không dấu, hiện cảnh báo khi kết quả có khách Tạm ngưng. Một phần MST/mã (`0302`, `000245`) vẫn tìm được |
| 05.3 Không có kết quả (A5.1) | Từ khóa không khớp, ví dụ `Hải Âu Shipping` |
| 05.4 Lỗi tải dữ liệu (A4.2) | Từ khóa `0318`: lần tìm đầu lỗi, "Thử lại" thì có kết quả |
| Tham số không hợp lệ (A4.1) | `/khach-hang?so-dong=1000&trang=abc`: báo điều kiện cần sửa, không chạy truy vấn |

Prototype chưa giới hạn phạm vi khách hàng theo người tra cứu vì đặc tả chưa có quy tắc phân công (`isInScope` trong `src/mocks/customersServer.ts`).

### UC-CUS-06 · Xem thông tin và hồ sơ khách hàng

Trang hồ sơ `/khach-hang/:ma` có các tab Tổng quan / Hợp đồng / Bảng giá / Bảng thanh toán / Lịch sử (tab lưu trên URL `?tab=hop-dong`). Ba nhóm hồ sơ liên quan tải riêng, số trên tab chỉ đếm hồ sơ trong phạm vi quyền. Dữ liệu mẫu đầy đủ ở `KH-000198` (CTCP Cảng Sao Biển), xem `src/mocks/seed/customerRecords.ts`.

| Frame Figma | Cách xem |
| --- | --- |
| 06.1 Tổng quan | `KH-000198`: nhận diện, đầu mối liên hệ, trạng thái hợp tác, tóm tắt hồ sơ liên quan, tạo & cập nhật |
| 06.2 Tab Hợp đồng | Chọn từng hợp đồng để xem chi tiết bên phải; trạng thái tính theo thời điểm đối chiếu |
| 06.3 Giá kỳ trước (A5.2) | Tab Bảng giá, thời điểm `15/09/2025`: phiên bản 2 gắn nhãn giá lịch sử, kèm đơn giá |
| 06.4 Bảng giá cần làm rõ (A5.3) | Dịch vụ "Lưu bãi container" tại hôm nay: 2 bảng giá trùng hiệu lực, không hiển thị đơn giá đề xuất |
| 06.5 Đối chiếu bảng thanh toán (A8.1) | Tab Bảng thanh toán: bảng lập trước khi đổi địa chỉ được tô vàng ở dòng khác hồ sơ hiện tại |
| 06.6 Báo sai lệch (A8.2) | "Báo sai lệch cho Kế toán": hồ sơ và nơi nhận bị khóa, nội dung bắt buộc; ghi nhật ký, không sửa bảng thanh toán |
| 06.7 Khách đang Tạm ngưng (A3.1) | `KH-000245` |
| 06.8 Không có hồ sơ phù hợp (A5.1) | Tab Hợp đồng: thời điểm `01/01/2024` + "Đang hiệu lực" |
| 06.9 Một nhóm không tải được (A5.5) | `KH-000310`: nhóm Bảng thanh toán lỗi ở lần đầu, các phần khác vẫn xem được; "Thử lại" tải riêng nhóm đó |
| 06.10 Không thể mở hồ sơ (A2 / A8.3) | `/khach-hang/KH-999999` |

Số trên tab Bảng giá đếm theo mã bảng giá (KH-000198 có 3 mã), frame Figma ghi 1 – cần nhóm chốt cách đếm. "Mở chi tiết hợp đồng" dẫn tới trang giữ chỗ của phân hệ Hợp đồng.

### Tài khoản mẫu

Mọi tài khoản mẫu dùng mật khẩu kiểm thử `Abc@12345` (trừ `linh.pt` dùng mật khẩu tạm `TamThoi@2026`, và tài khoản đã đổi/đặt lại mật khẩu); có thể đăng nhập bằng tên đăng nhập hoặc email (`an.nv@abc.vn`). Danh sách đầy đủ ở `src/mocks/seed/users.ts`. Xóa key `qtkd.mock.v1` trong localStorage để khôi phục dữ liệu mẫu ban đầu (gồm cả mật khẩu đã đặt lại).

"Thông tin cá nhân", "Đổi mật khẩu" và "Đăng xuất" nằm trong menu tài khoản khi bấm avatar trên Topbar (frame 03.0); Sidebar chỉ còn menu nghiệp vụ. Các mục menu thuộc UC khác (hợp đồng, khu vực, phê duyệt, quản trị, thông tin cá nhân) hiện là trang giữ chỗ.

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
