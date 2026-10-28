# 23HTTT-PTUD_HTTTH--QTKD

## Bộ khung Sprint 1

Repo khởi đầu cho đề tài Quản trị kinh doanh trong doanh nghiệp logistics. Phạm vi bàn giao: thư mục FE, BE, DB và tài liệu hướng dẫn agent theo Sprint 1. Chưa có ứng dụng, schema, migration hay CI để chạy.

```text
23HTTT-PTUD_HTTTH--QTKD/
  FE/.gitkeep
  BE/.gitkeep
  DB/.gitkeep
  .agents/skills/qtkd-sprint1/SKILL.md
  AGENTS.md
  context/
    PROJECT.md
    SPRINT-1.md
    BUSINESS-RULES.md
  docs/sources/
    QTKD_DATH (1).pdf
    SprintPlan_QTKD.xlsx
```

Ba thư mục FE, BE, DB chỉ chứa `.gitkeep` vì Git không lưu thư mục rỗng.

## Dành cho thành viên

- Đọc [phạm vi Sprint 1](context/SPRINT-1.md) trước khi nhận việc.
- Công nghệ ghi trong kế hoạch: FE React + TypeScript + Vite; BE C#/.NET Web API, EF Core; DB PostgreSQL qua Supabase. Phiên bản chưa chốt.
- Remote hiện có: `https://github.com/Spring-anzuaviv/23HTTT-PTUD_HTTTH--QTKD.git`. Repo đang public. Bộ khung được dựng tại máy, chưa push. PDF yêu cầu GitLab, kế hoạch ghi GitHub; nhóm vẫn cần xác nhận yêu cầu nền tảng của môn học. Chưa cấu hình bảo vệ nhánh hoặc CI trong lần dựng này.
- Không có lệnh chạy ứng dụng ở giai đoạn bộ khung này.

## Dành cho agent

Đọc [AGENTS.md](AGENTS.md), rồi [context dự án](context/PROJECT.md). Skill dự án nằm tại [.agents/skills/qtkd-sprint1/SKILL.md](.agents/skills/qtkd-sprint1/SKILL.md).

Ví dụ yêu cầu tiếp theo khi muốn triển khai: “Hãy thực hiện TASK-049 trong BE theo Sprint 1”. Việc nhận bộ khung này không tự cho phép agent triển khai các task khác.

Hai tài liệu nguồn được giữ nguyên trong [docs/sources](docs/sources/). Tài liệu context là bản tổng hợp để làm việc, không thay thế các AC và đặc tả chi tiết còn thiếu.
