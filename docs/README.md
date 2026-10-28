# Tài liệu dự án

| Thư mục | Nội dung | Task liên quan |
| --- | --- | --- |
| `sources/` | PDF đề bài và workbook kế hoạch, giữ nguyên bản gốc | — |
| `architecture/` | [Cấu trúc thư mục và bản đồ module](architecture/STRUCTURE.md) | TASK-049, 031 |
| `decisions/` | Quyết định kỹ thuật cần chốt, mỗi quyết định một file | TASK-001, 050 |
| `specs/<module>/` | Đặc tả UC hệ thống: `identity`, `customers`, `areas`, `contracts`, `approvals`, `catalogs` | TASK-002, 011, 021, 029, 038, 048, 058 |
| `diagrams/use-case/` | Use case diagram | TASK-002 |
| `diagrams/class/` | Class diagram, mô hình workflow engine | TASK-039, 051 |
| `diagrams/sequence/` | Sequence diagram theo module | TASK-012, 039, 051, 059 |
| `ui/` | Liên kết Figma, ảnh chụp màn hình đã chốt | TASK-003 |
| `testing/test-plan/` | Test plan tổng | TASK-046 |
| `testing/test-cases/` | Test case theo module | TASK-046, 047 |
| `testing/postman/` | Postman collection | TASK-008, 046 |
| `testing/demo/` | Kịch bản demo MVP1 | TASK-009, 047 |

Khi đến Sprint 2/3, thêm thư mục `specs/<module>/` cho module mới theo [bản đồ module](architecture/STRUCTURE.md).

ERD đặt ở [DB/erd](../DB/erd/) để gần tài nguyên DB.
