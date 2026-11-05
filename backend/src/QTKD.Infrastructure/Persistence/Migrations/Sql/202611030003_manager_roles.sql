-- SYS-CTR-10: vai trò trưởng bộ phận cho Pháp chế và Ban Giám đốc. Additive; deploy through Prisma only.
-- Giá trị enum mới không được dùng trong cùng transaction tạo ra nó, nên role_definition và quyền
-- của hai vai trò này nằm ở migration 202611030004_approval_assignment.
BEGIN;
ALTER TYPE "qtkd"."user_role" ADD VALUE IF NOT EXISTS 'LegalManager' AFTER 'LegalStaff';
ALTER TYPE "qtkd"."user_role" ADD VALUE IF NOT EXISTS 'BoardChair' AFTER 'BoardMember';
COMMIT;
