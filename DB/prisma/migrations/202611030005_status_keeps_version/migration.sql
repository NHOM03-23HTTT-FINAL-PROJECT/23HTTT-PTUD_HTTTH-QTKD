-- SYS-CTR-04/07: version là phiên bản nội dung hồ sơ. Đổi trạng thái (trình, tiếp nhận, duyệt) không tăng version,
-- để approval_round.record_version luôn khớp contract.version trong suốt lượt duyệt.
-- Version vẫn tăng khi nội dung đổi, hoặc khi lệnh ghi chủ động đặt version = version + 1 (ví dụ hủy hồ sơ).
-- Additive; deploy through Prisma only.
BEGIN;
CREATE OR REPLACE FUNCTION qtkd.guard_contract_content() RETURNS trigger LANGUAGE plpgsql
SET search_path=pg_catalog,qtkd AS $$
DECLARE changed boolean;
BEGIN
 IF NEW.owner_id<>OLD.owner_id OR (OLD.owning_department_id IS NOT NULL AND NEW.owning_department_id IS DISTINCT FROM OLD.owning_department_id) THEN
  RAISE EXCEPTION 'Contract owner and department are immutable' USING ERRCODE='23514';
 END IF;
 changed := (to_jsonb(NEW)-ARRAY['status','version','updated_at','cancelled_by','cancelled_at','cancellation_reason'])
  IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','version','updated_at','cancelled_by','cancelled_at','cancellation_reason']);
 IF OLD.status='Cancelled' AND NEW IS DISTINCT FROM OLD THEN
  RAISE EXCEPTION 'Cancelled contract is read-only' USING ERRCODE='23514';
 END IF;
 IF changed AND OLD.status NOT IN ('Draft','RevisionRequested') THEN
  RAISE EXCEPTION 'Contract content can only change in Draft or RevisionRequested' USING ERRCODE='23514';
 END IF;
 IF (changed OR NEW.status<>OLD.status OR NEW.version<>OLD.version) AND EXISTS(
  SELECT 1 FROM qtkd.contract_cancellation_request WHERE contract_id=OLD.contract_id AND status IN ('pending-sales','pending-board')) THEN
  RAISE EXCEPTION 'Cancellation request is pending' USING ERRCODE='23514';
 END IF;
 IF NEW.version NOT IN (OLD.version,OLD.version+1) THEN RAISE EXCEPTION 'Invalid version' USING ERRCODE='23514'; END IF;
 NEW.version:=OLD.version+CASE WHEN changed OR NEW.version=OLD.version+1 THEN 1 ELSE 0 END;
 NEW.updated_at:=CURRENT_TIMESTAMP;
 RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION qtkd.guard_contract_content() FROM PUBLIC;
COMMIT;
