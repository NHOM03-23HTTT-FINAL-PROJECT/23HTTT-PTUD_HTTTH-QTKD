# Quyết định kỹ thuật

Mỗi quyết định ghi một file `NNNN-ten-quyet-dinh.md` gồm: bối cảnh, phương án, quyết định, ngày chốt, người chốt.

## Cần chốt

Lấy từ [context/PROJECT.md](../../context/PROJECT.md) và bộ khung thư mục:

- Git hosting: GitLab (PDF) hay GitHub (kế hoạch); CI tương ứng.
- Phiên bản .NET, Node.js, PostgreSQL và thư viện chính.
- Xác thực: JWT tự phát hay Supabase Auth; nơi lưu tệp đính kèm.
- Nguồn schema: EF Core migration trong BE (đề xuất tại [DB/README.md](../../DB/README.md)).
- Cách tổ chức Application: Services hay MediatR/CQRS (xem [BE/README.md](../../BE/README.md)).
- Quy ước nhánh, Pull Request, Definition of Done (TASK-001).
