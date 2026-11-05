# Kiểm thử UI khách hàng qua API

Ngày 05/11/2026, nhánh `cus-flow`. Tiếp nối [ghép main và migration EF](customers-main-ef.md). Phạm vi: nối UI với backend thật, giữ bố cục main, giữ backend SYS-CUS-03 đã gỡ, không push và không ghi Supabase dùng chung.

## Hành vi đã nối

- Danh sách/tìm kiếm/lọc/phân trang, tạo, sửa, chi tiết và lịch sử lấy dữ liệu qua API. Tải lại trang vẫn đọc đúng dữ liệu PostgreSQL; không dùng kho mock cho danh tính API.
- JWT/refresh/logout/CSRF dùng client chung. Actor, thời gian đăng nhập, người phụ trách và trạng thái không được gửi như dữ liệu ghi do client tự chọn. Tạo/sửa giữ Idempotency-Key khi thử lại.
- Hồ sơ ngoài phạm vi bị che; sửa kiểm tra quyền sở hữu tại UI và backend. Dữ liệu cũ không hiển thị trong lúc đổi hồ sơ hoặc phiên. Kết quả tải chậm của trang trước không ghi vào trang sau.
- Xung đột phiên bản mở dialog với hồ sơ mới nhất; tải lại giữ thay đổi độc lập, rồi lưu bằng version/key mới.
- Trưởng phòng có màn `/khach-hang/uy-quyen`, mở từ danh sách: chọn người, thời hạn và ghi chú; cấp/thu hồi quyền kích hoạt lại qua API. Nhân viên thường không vào được màn quản lý. Không cấp quyền Suspend.
- Kích hoạt lại đã nối GET context/POST action; UI dùng quyền và căn cứ từ server, không tự coi lời khai ngoại lệ hoặc tên tệp là xác nhận thật.
- Tạm ngưng ở chế độ API báo chưa sẵn sàng và không gọi endpoint đã gỡ. Prototype chỉ chạy nếu chọn rõ `VITE_AUTH_MODE=mock`.
- Metadata legacy thiếu ngày/người tạo hiển thị chưa rõ; không dựng thời điểm tạo hoặc lịch sử giả. Nhóm hồ sơ thiếu nguồn báo phụ thuộc, lỗi quyền báo thiếu quyền, lỗi mạng có thể thử lại.

Không chuyển runtime backend Npgsql sang repository EF trong lần nối UI này; không có migration mới.

## Kiểm chứng thực tế

Chạy Chrome headless trên `http://localhost:5173`, cùng mã API thật và PostgreSQL 18.1 local đã áp 11 migration EF. Test tạo tài khoản/hồ sơ synthetic có prefix riêng, đối chiếu UUID đăng nhập với DB local trước khi ghi. Không bật ControlledSource hay đọc env Supabase.

Script: `backend/tests/customer-main-api-ui.mjs`.

| Ca | Kết quả |
|---|---|
| Danh sách đọc hồ sơ local và không hiện khách prototype | PASS |
| Validate tạo ở UI, chưa gửi dữ liệu sai | PASS |
| Tạo → chi tiết → reload, kiểm tra owner/version/MST/audit thực trong PostgreSQL | PASS |
| Tìm theo MST, không có kết quả, trạng thái, phân trang 8+2 từ API | PASS |
| MST trùng bị API từ chối, DB chỉ có một hồ sơ | PASS |
| Sửa giữ MST, tăng version, ghi lý do/lịch sử thật | PASS |
| Đồng nghiệp xem được nhưng không sửa; ngoài phạm vi không lộ hồ sơ | PASS |
| Hai phiên sửa cạnh tranh: nhận 409, đối chiếu bản mới, giữ thay đổi độc lập | PASS |
| Các tab liên quan báo đúng nguồn chưa nối/quyền thiếu; không lấy mock | PASS |
| Giả lập 503: có lỗi và retry, giữ đăng nhập, không dùng dữ liệu mẫu | PASS |
| Cho server lưu rồi làm mất phản hồi: retry cùng key, DB chỉ tạo một khách | PASS |
| Trưởng phòng cấp/thu hồi quyền bằng UI, chặn thời hạn quá khứ; nhân viên được giao mở context, thiếu xác minh thì nút khóa; thu hồi xong không còn quyền | PASS |
| Nhân viên thường không mở hoặc gọi API quản lý ủy quyền từ UI | PASS |
| Màn tạm ngưng API chưa sẵn sàng, không gọi endpoint bị gỡ, trạng thái không đổi | PASS |
| Khách Active vừa tạo chọn được cho hợp đồng thật; Suspended không có trong lookup | PASS |
| Không có lỗi JavaScript chưa xử lý | PASS |

**16/16 ca browser PASS.** `npm run build` PASS; `npm run test:auth` PASS **24/24**, gồm kiểm tra route API, quyền, CSRF, refresh và logout. Bộ backend và migration của lần trước không bị sửa trong lần tích hợp này. Vite còn cảnh báo kích thước bundle.

Bằng chứng local: `D:/VSCode/PTUDHTTTHD/.qtkd-tools/customer-api-ui/api-ui-report.json`, `created-api.png`, `customer-api-final.png`.

## Giới hạn còn lại

- Backend SYS-CUS-03 bị gỡ theo yêu cầu. Màn thông báo chưa sẵn sàng ở chế độ API là chủ ý.
- Nguồn xác minh nghiệp vụ thật cho kích hoạt lại chưa nối, nên ca thực tế hiện dừng ở context với nút xác nhận bị khóa. Không báo đã kích hoạt lại thành công từ nguồn thật.
- Các nhóm hợp đồng/bảng giá/thanh toán trong chi tiết khách hàng còn phụ thuộc API nguồn; UI đã gọi và báo đúng trạng thái thiếu nguồn, chưa hiển thị danh sách thật. Lookup khách hàng trong phân hệ hợp đồng đã hoạt động.
- API MST trùng chưa trả liên kết tới hồ sơ trùng trong phạm vi; UI hiện báo trùng an toàn.
- Worker chuyển customer outbox tới Notifications chưa có; không báo thông báo đã gửi.
- Hai lỗi mobile của main ghi trong báo cáo giai đoạn trước chưa được sửa ở lần nối API này.

## Chạy để test

Hiện cổng 5173 chạy `VITE_AUTH_MODE=api`, `VITE_CONTRACTS_USE_BACKEND=true`, proxy tới backend local 7156. DB dùng riêng ở loopback 55439.

Tài khoản local dành cho người dùng: `test.customer.staff`, `test.customer.other`, `test.customer.manager`; mật khẩu **Customer.Test@2026**. Đây là dữ liệu test local, không phải tài khoản Supabase. Backend/DB/frontend được giữ chạy để kiểm tra.

Để chạy lại script tự động: đặt `QTKD_CUSTOMER_TEST_DISPOSABLE=true`, `QTKD_CUSTOMER_TEST_PORT`, `QTKD_UI_BASE=http://localhost:5173`, `QTKD_PLAYWRIGHT_PACKAGE`, `QTKD_BROWSER_PATH`, `QTKD_UI_ARTIFACTS` rồi chạy `node backend/tests/customer-main-api-ui.mjs`. Script cần baseline migration/seed của main và API local đang hoạt động; không có fallback tới cấu hình DB thật.

Không thay env được cung cấp riêng, không push và không ghi Supabase dùng chung.
