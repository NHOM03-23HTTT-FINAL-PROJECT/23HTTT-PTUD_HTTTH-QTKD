-- SYS-CTR-10 (sửa ngày 03/11/2026): trưởng bộ phận phân công người duyệt cho từng hồ sơ.
-- Additive migration; deploy through Prisma only. Thay cấu hình theo phiên bản (202611030002) bằng phân công.
BEGIN;

-- 1. Bỏ cấu hình người tham gia theo phiên bản. Lượt duyệt không tham chiếu bảng này.
DROP TRIGGER IF EXISTS workflow_config_history ON "qtkd"."workflow_config";
DROP TABLE IF EXISTS "qtkd"."workflow_config";
DROP FUNCTION IF EXISTS qtkd.guard_workflow_config();

-- 2. Vai trò trưởng bộ phận (enum thêm ở 202611030003_manager_roles): làm được việc của nhân viên phòng
--    và có quyền phân công. BE còn kiểm tra người gọi là trưởng (department.manager_id) của phòng phụ trách bước.
INSERT INTO "qtkd"."role_definition"(code, name, department_code) VALUES
 ('LegalManager', 'Trưởng phòng Pháp chế', 'PC'),
 ('BoardChair', 'Tổng Giám đốc', 'BGD')
ON CONFLICT (code) DO NOTHING;
INSERT INTO "qtkd"."permission"(code, name) VALUES ('approvals.assign', 'approvals.assign') ON CONFLICT (code) DO NOTHING;
WITH grants(role, permission_code) AS (
 SELECT 'SalesManager', unnest(ARRAY['approvals.assign']) UNION ALL
 SELECT 'LegalManager', unnest(ARRAY['contracts.view','approvals.track','approvals.review-legal','approvals.assign']) UNION ALL
 SELECT 'BoardChair', unnest(ARRAY['contracts.view','approvals.track','approvals.approve','approvals.assign'])
) INSERT INTO "qtkd"."role_permission" SELECT role::qtkd.user_role, permission_code FROM grants ON CONFLICT DO NOTHING;

-- 3. Cho đổi người được phân công khi bước chưa bắt đầu: chưa tới lượt (NotStarted)
--    hoặc đã giao nhưng chưa tiếp nhận (Pending, accepted_at trống). Quyết định và thứ tự vẫn không sửa được.
CREATE OR REPLACE FUNCTION qtkd.guard_approval_history() RETURNS trigger LANGUAGE plpgsql
SET search_path = pg_catalog, qtkd AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Approval history cannot be deleted' USING ERRCODE = '23514'; END IF;
  IF TG_TABLE_NAME = 'approval_round' THEN
    IF (to_jsonb(NEW) - ARRAY['result','ended_at']) IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['result','ended_at']) OR OLD.result <> 'Running' THEN
      RAISE EXCEPTION 'Approval source, snapshot and completed history are immutable' USING ERRCODE = '23514';
    END IF;
    IF NEW.result = 'Completed' AND (NOT EXISTS (SELECT 1 FROM qtkd.approval_step WHERE round_id = NEW.round_id) OR
      EXISTS (SELECT 1 FROM qtkd.approval_step WHERE round_id = NEW.round_id AND (step_status <> 'Completed' OR decision IS DISTINCT FROM 'Approve'))) THEN
      RAISE EXCEPTION 'Cannot complete approval before all steps approve' USING ERRCODE = '23514';
    END IF;
  ELSE
    IF OLD.decision IS NOT NULL OR NEW.round_id <> OLD.round_id OR NEW.step_order <> OLD.step_order OR
       (NEW.assignee_id IS DISTINCT FROM OLD.assignee_id AND NOT (
         NEW.assignee_id IS NOT NULL AND (OLD.step_status = 'NotStarted' OR (OLD.step_status = 'Pending' AND OLD.accepted_at IS NULL))
       )) THEN
      RAISE EXCEPTION 'Decision, started assignment and order cannot be rewritten' USING ERRCODE = '23514';
    END IF;
    PERFORM 1 FROM qtkd.approval_round WHERE round_id=NEW.round_id AND result='Running' FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Approval round is closed' USING ERRCODE = '23514'; END IF;
    IF NEW.step_status IN ('Pending','Reviewing','Completed') AND EXISTS (
      SELECT 1 FROM qtkd.approval_step WHERE round_id=NEW.round_id AND step_order<NEW.step_order
      AND (step_status<>'Completed' OR decision IS DISTINCT FROM 'Approve')) THEN
      RAISE EXCEPTION 'Cannot skip approval steps' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION qtkd.guard_approval_history() FROM PUBLIC;
COMMIT;
