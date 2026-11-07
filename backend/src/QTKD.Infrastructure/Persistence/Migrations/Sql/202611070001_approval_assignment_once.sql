-- SYS-CTR-10 / US-CTR-29 (07/11): only the current, unassigned step can be assigned, exactly once.
-- EF Core applies this function change. No existing round, decision, assignee or snapshot is rewritten.
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
        OLD.assignee_id IS NULL AND NEW.assignee_id IS NOT NULL AND OLD.step_status = 'NotStarted'
        AND NEW.step_status = 'Pending'
      )) THEN
      RAISE EXCEPTION 'Decision, assignment and order are immutable' USING ERRCODE = '23514';
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
