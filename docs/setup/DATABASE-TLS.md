# Seed P1011: kiểm tra kết nối PostgreSQL TLS

P1011 xuất hiện trước khi seed commit vì kết nối TLS thất bại. DEP0205 là warning riêng của tsx/Node 26. Warning sslmode là thông báo về thay đổi hành vi pg, không cho biết lỗi chứng chỉ cụ thể.

Từ thư mục DB, chạy `npm run connection:check`. Lệnh dùng cùng DIRECT_URL/driver pg như seed, chỉ thực hiện SELECT 1, không migrate/seed. Lỗi được chuyển thành mã và hướng dẫn cố định; không in URI, mật khẩu, hostname hay raw error. PASS ở đây chỉ chứng minh kết nối và SELECT, không chứng minh seed/schema hợp lệ.

## Cấu hình CA khi gặp lỗi chứng chỉ

1. Trong Supabase project, vào Database Settings > SSL Configuration > Download certificate. Lưu CA đúng project trên máy, ví dụ `C:/certs/prod-ca-2021.crt`.
2. Trong DB/.env, giữ URI Direct/Session chính xác từ Connect. Dùng `sslmode=verify-full`; nếu cần CA tải về, thêm `sslrootcert` trỏ đến file. Ví dụ phần query, không chứa mật khẩu:

   ```text
   ?schema=qtkd&sslmode=verify-full&sslrootcert=C%3A%2Fcerts%2Fprod-ca-2021.crt
   ```

   Đường dẫn trong ví dụ chỉ có tác dụng sau khi lưu file đúng chỗ. Dùng dấu `/` và URI-encode giá trị path. Trên Windows, không chép nguyên đường dẫn dùng dấu `\` vào URI trong dotenv có ngoặc kép: dotenv đổi `\n`/`\r` thành xuống dòng, khiến file có tồn tại vẫn báo ENOENT. sslrootcert được pg hỗ trợ trực tiếp; không thêm ssl.ca riêng cạnh connectionString có sslmode vì pg có thể ghi đè cấu hình đó.
3. Có thể thống nhất file local ở `DB/.env.supabase-ca.crt` và dùng `sslrootcert=./.env.supabase-ca.crt` khi chạy từ DB/. File này đã được pattern .env.* ignore. Nếu chuyển máy, nhận/tải lại CA và chỉnh path thay vì giữ đường dẫn máy của người gửi.
4. BE dùng Npgsql: launcher hiện chưa chuyển sslrootcert trong URI sang connection string. Với file CA trên, chạy từ gốc repo trong chính terminal BE:

   ```powershell
   $env:PGSSLROOTCERT = (Resolve-Path -LiteralPath './DB/.env.supabase-ca.crt').Path
   ./backend/Start-Api.ps1
   ```

   Nếu máy đã tin CA và không dùng file CA riêng thì không cần gán biến này. CA DB khác HTTPS dev certificate cho localhost.
5. Chạy lại `npm run connection:check` từ DB/. PASS chỉ chứng minh kết nối đọc; người dùng DB chung đã chuẩn bị không cần chạy seed. Chỉ seed khi đang chuẩn bị dữ liệu trên DB đã được giao, theo [hướng dẫn fullstack](LOCAL-FULLSTACK.md).

Đổi require sang verify-full làm rõ hành vi xác minh và bỏ warning SSL-mode; bản thân thay đổi tên mode không sửa được CA thiếu/sai. Không dùng NODE_TLS_REJECT_UNAUTHORIZED=0, rejectUnauthorized=false hay sslmode=no-verify để bỏ qua lỗi.

## Đọc mã chẩn đoán

| Mã | Xử lý |
| --- | --- |
| SELF_SIGNED_CERT_IN_CHAIN / DEPTH_ZERO_SELF_SIGNED_CERT / UNABLE_TO_VERIFY_LEAF_SIGNATURE / UNABLE_TO_GET_ISSUER_CERT_LOCALLY | Kiểm tra CA đúng project. Nếu mạng có TLS inspection, kiểm tra trust chain với người quản trị mạng |
| ERR_TLS_CERT_ALTNAME_INVALID | Dùng hostname nguyên bản từ Connect, không thay bằng IP |
| CERT_HAS_EXPIRED | Kiểm tra đồng hồ máy và certificate hiện hành |
| ENOENT | File sslrootcert không tồn tại; đường dẫn tương đối tính từ DB |
| ENOTFOUND / EAI_AGAIN | DNS/hostname; không phải bằng chứng lỗi CA |
| ENETUNREACH / ETIMEDOUT | Kiểm tra mạng; nếu không có IPv6, lấy nguyên URI Session pooler cổng 5432 từ Connect, gồm cả username riêng của pooler |
| 28P01 / 28000 | Kiểm tra database password, username và percent-encoding; khác với SEED_PASSWORD |

Lượt kiểm tra từ môi trường agent ngày 02/11/2026 bị ENOTFOUND tại direct host, chưa đến TLS. Vì vậy chưa xác nhận nguyên nhân chứng chỉ cụ thể hay kết nối/seed thành công trên máy người dùng. Không thay đổi DB, SSL enforcement hoặc mật khẩu project.

Nguồn: [Supabase SSL](https://supabase.com/docs/guides/database/connecting-to-postgres#ssl), [SSL enforcement và tải CA](https://supabase.com/docs/guides/platform/ssl-enforcement), [node-postgres SSL configuration](https://node-postgres.com/features/ssl).
