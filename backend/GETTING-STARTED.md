# Backend quản lý hợp đồng

Phạm vi: **US-CTR-01, 02, 16 (hợp đồng), 18 và 19**. Chỉ triển khai CRUD hợp đồng, tệp đính kèm và đề nghị hủy, gồm quyết định chấp thuận/từ chối thuộc US-CTR-19.

Các module đăng nhập, đăng xuất, đổi mật khẩu, quản lý người dùng, khách hàng, khu vực, dashboard, trình/rà soát/phê duyệt hợp đồng, thông báo và ký do thành viên khác phụ trách. Phụ lục ngoài phạm vi đợt này.

## Cấu trúc

- `QTKD.Api`: endpoint hợp đồng và adapter đọc danh tính đã xác thực.
- `QTKD.Application`: service, DTO class thông thường, validation và interface.
- `QTKD.Domain`: quy tắc trạng thái, quyền sở hữu và lỗi nghiệp vụ.
- `QTKD.Infrastructure`: Npgsql, SQL có tham số, transaction và lưu tệp riêng.
- `DB/prisma`: nguồn migration hiện tại; không chạy EF migration song song.

## Tích hợp xác thực

Sau khi ghép `origin/main` tại `9e70d3e`, ứng dụng có module identity của nhóm. Module hợp đồng dùng chung JWT, kiểm tra phiên và permission của module đó; không có chức năng đăng nhập riêng. `CurrentActor` đọc UUID từ claim `sub`, rồi đọc lại vai trò, trạng thái và phòng ban từ DB để kiểm tra phạm vi hồ sơ.

Cấu hình theo `backend/.env.example` của main:

- `Jwt__SigningKey`: khóa riêng, tối thiểu 32 byte.
- `ConnectionStrings__Identity`: kết nối Npgsql; có thể để trống để launcher suy ra từ `DB/.env`.

FE hợp đồng mặc định lấy access token trong bộ nhớ từ `src/lib/http/client.ts`, dùng refresh của module chung khi token sắp hết hạn. `configureContractTokenProvider` chỉ cần khi thay adapter hoặc chạy fixture kiểm thử; không lưu token mới vào localStorage.

## Chạy

Launcher từ main đọc `backend/.env` và `DB/.env`. Cần SDK tương ứng `backend/global.json` (10.0.403). Không đưa URI, signing key hay mật khẩu vào Git.

```powershell
dotnet restore backend/QTKD.slnx
./backend/Start-Api.ps1 -ValidateOnly
./backend/Start-Api.ps1
```

API chạy tại `https://localhost:7156`. `GET /health/live` và `/api/health` chỉ kiểm tra tiến trình. Cơ chế `--check-db` cũ đã được thay bằng công cụ DB của main; dùng `npm run connection:check` trong `DB/` để kiểm tra kết nối.

Bật riêng API hợp đồng trong cấu hình FE:

```dotenv
VITE_CONTRACTS_USE_BACKEND=true
VITE_AUTH_MODE=api
```

Chạy `npm run dev` trong `frontend/`. Vite proxy `/api` sang HTTPS cổng 7156; `QTKD_API_PROXY` cho phép đổi đích khi kiểm thử. Các file `.env` riêng trên máy được giữ nguyên; tự bổ sung hai biến FE trên nếu chưa có.

Đăng nhập bằng `demo.sales`, `demo.sales.manager`, `demo.board` hoặc tài khoản tương ứng có sẵn trong seed. Mật khẩu là `SEED_PASSWORD` đã dùng khi chạy seed, không phải mật khẩu Supabase. Đổi giá trị trong `.env` không tự đổi mật khẩu các tài khoản đã seed. Seed mặc định yêu cầu đổi mật khẩu ở lần đăng nhập đầu; hoàn tất màn đổi mật khẩu rồi vào hợp đồng. Không cần tạo endpoint giả hoặc bỏ `[Authorize]`.

Migration `202611020004_contracts` bổ sung mã hợp đồng, snapshot, metadata tệp, đề nghị hủy, idempotency và dữ liệu bàn giao kết quả hủy. Hai migration cũ giữ nguyên. `DB/data-dictionary/baseline.prisma` đối chiếu schema gốc. Review migration trước khi nhóm áp dụng; backend không tự migrate/seed. Lượt chỉnh sửa này không ghi Supabase.

## Quy tắc và điểm bàn giao

- Chỉ người phụ trách sửa Draft/RevisionRequested, hủy trực tiếp Draft; cần lý do. Hồ sơ Cancelled là trạng thái kết thúc.
- Danh sách lọc theo quyền trước khi đếm/phân trang. NVKD xem hồ sơ mình phụ trách; trưởng phòng xem phòng mình quản lý; pháp chế/BGĐ xem hồ sơ có phân công.
- Khách hàng và khu vực được đọc từ danh mục có sẵn; không có API quản lý danh mục mới.
- Tệp tối đa 20 MiB, lưu riêng ngoài web root tại `.data/uploads`, đổi bằng `Storage__Root`. Tải tệp kiểm tra quyền. Xóa liên kết giữ blob để bảo toàn dữ liệu.
- Đề nghị hủy giữ trạng thái hợp đồng và khóa chỉnh sửa khi chờ. Người được giao quyết định; hợp đồng Approved cần thêm quyết định BGĐ. Từ chối bắt buộc lý do.
- Chấp thuận hủy cuối cùng đóng lượt duyệt đang chạy, ghi audit và thông báo nội bộ liên quan trong transaction. Đây là hệ quả của US-CTR-19; không có endpoint trình/duyệt hợp đồng.
- `contract_delivery` chỉ lưu yêu cầu thông báo kết quả hủy để bàn giao module thông báo. Không có worker hay dịch vụ gửi email trong phần này; Pending không có nghĩa đã gửi.
- Nếu đã có chữ ký, không cho dùng luồng hủy chưa ký. Phiên ký đang Signing trả `SIGNING_CANCELLATION_REQUIRED`; module ký phải xác nhận dừng trước khi hoàn tất hủy.
- Mẫu hợp đồng trong code là mẫu tham khảo; chưa phải mẫu nghiệp vụ chính thức.

## Kiểm tra

```powershell
dotnet build backend/QTKD.slnx
cd frontend
npm run build
cd ../DB
npm run check
npm run test:contracts
```

`test:contracts` dùng PGlite trong bộ nhớ, gọi API .NET thật với JWT và phiên fixture được module identity kiểm tra. Không đọc DIRECT_URL, không truy cập Supabase. Cần Node 24.11+ và BE Debug đã build. Kiểm tra quyền, dữ liệu đầu vào, idempotency, version, tệp và đề nghị hủy hai cấp. PGlite dùng một backend connection; browser test tuần tự hóa request tại harness. Kiểm thử đồng thời nhiều connection cần PostgreSQL riêng, không được suy ra từ kết quả PGlite.

Browser test tùy chọn: đặt `QTKD_PLAYWRIGHT_MODULE` tới `playwright/index.mjs`, `QTKD_BROWSER_EXECUTABLE` tới Chrome/Edge rồi chạy `test:contracts`. Browser dùng fixture danh tính bên ngoài để kiểm tra hợp đồng. Tích hợp với auth, thông báo và ký thật của nhóm vẫn cần kiểm thử chung.
