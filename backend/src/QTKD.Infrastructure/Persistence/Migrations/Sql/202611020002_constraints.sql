BEGIN;

-- PostgreSQL 15+ features. These constraints cannot all be expressed in Prisma schema.
ALTER TABLE qtkd.user_account
  ADD CONSTRAINT user_nonblank CHECK (btrim(username) <> '' AND btrim(company_email) <> '' AND btrim(password_hash) <> '' AND btrim(full_name) <> ''),
  ADD CONSTRAINT user_failed_count CHECK (failed_login_count >= 0),
  ADD CONSTRAINT user_lock_time CHECK (status <> 'TemporarilyLocked' OR locked_until IS NOT NULL);
CREATE UNIQUE INDEX user_username_ci ON qtkd.user_account (lower(btrim(username)));
CREATE UNIQUE INDEX user_email_ci ON qtkd.user_account (lower(btrim(company_email)));
ALTER TABLE qtkd.department ADD CONSTRAINT department_nonblank CHECK (btrim(department_name) <> '');
ALTER TABLE qtkd.login_session
  ADD CONSTRAINT session_dates CHECK (expires_at > created_at),
  ADD CONSTRAINT session_revocation CHECK (is_revoked = (end_reason IS NOT NULL));
ALTER TABLE qtkd.password_otp
  ADD CONSTRAINT otp_dates CHECK (expires_at > sent_at),
  ADD CONSTRAINT otp_attempts CHECK (failed_count BETWEEN 0 AND 5);
ALTER TABLE qtkd.customer
  ADD CONSTRAINT customer_tax_format CHECK (tax_code ~ '^[0-9]{10}([0-9]{3})?$'),
  ADD CONSTRAINT customer_required CHECK (btrim(customer_name) <> '' AND btrim(address) <> '' AND btrim(legal_representative) <> ''),
  ADD CONSTRAINT customer_contact CHECK (nullif(btrim(phone), '') IS NOT NULL OR nullif(btrim(email), '') IS NOT NULL),
  ADD CONSTRAINT customer_version_positive CHECK (version > 0);
ALTER TABLE qtkd.customer_status_decision ADD CONSTRAINT customer_decision_reason CHECK (btrim(reason) <> '');
ALTER TABLE qtkd.area
  ADD CONSTRAINT area_required CHECK (btrim(area_code) <> '' AND btrim(area_name) <> '' AND btrim(area_type) <> '' AND position('/' IN area_code) = 0),
  ADD CONSTRAINT area_depth CHECK (level BETWEEN 1 AND 3),
  ADD CONSTRAINT area_dimensions CHECK (area_m2 > 0 AND capacity > 0),
  ADD CONSTRAINT area_no_self_parent CHECK (area_id IS DISTINCT FROM parent_area_id),
  ADD CONSTRAINT area_version_positive CHECK (row_version > 0);
CREATE UNIQUE INDEX area_code_ci ON qtkd.area (lower(btrim(area_code)));
CREATE UNIQUE INDEX area_sibling_name_ci ON qtkd.area (parent_area_id, lower(btrim(area_name))) NULLS NOT DISTINCT;
ALTER TABLE qtkd.area_assignment ADD CONSTRAINT assignment_dates CHECK (to_date IS NULL OR to_date > from_date);
ALTER TABLE qtkd.service ADD CONSTRAINT service_required CHECK (btrim(service_name) <> '' AND btrim(unit) <> '');
ALTER TABLE qtkd.contract
  ADD CONSTRAINT contract_dates CHECK (end_date > start_date),
  ADD CONSTRAINT contract_value_nonnegative CHECK (contract_value >= 0),
  ADD CONSTRAINT contract_version_positive CHECK (version > 0),
  ADD CONSTRAINT contract_required CHECK (btrim(title) <> '' AND btrim(contract_type) <> '' AND btrim(payment_terms) <> '' AND btrim(content) <> ''),
  ADD CONSTRAINT contract_parent_type CHECK ((document_type = 'Contract' AND parent_contract_id IS NULL) OR (document_type <> 'Contract' AND parent_contract_id IS NOT NULL)),
  ADD CONSTRAINT contract_no_self_parent CHECK (contract_id IS DISTINCT FROM parent_contract_id);
ALTER TABLE qtkd.price_list
  ADD CONSTRAINT price_dates CHECK (effective_to >= effective_from),
  ADD CONSTRAINT price_version_positive CHECK (version > 0);
ALTER TABLE qtkd.price_list_line ADD CONSTRAINT unit_price_nonnegative CHECK (unit_price >= 0 AND btrim(unit) <> '');
ALTER TABLE qtkd.volume_period
  ADD CONSTRAINT volume_billing_period CHECK (billing_period ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  ADD CONSTRAINT volume_lock_metadata CHECK (status <> 'Locked' OR (locked_by IS NOT NULL AND locked_at IS NOT NULL));
ALTER TABLE qtkd.volume_line ADD CONSTRAINT volume_quantity_nonnegative CHECK (quantity >= 0);
ALTER TABLE qtkd.payment_statement
  ADD CONSTRAINT payment_billing_period CHECK (billing_period ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  ADD CONSTRAINT payment_amounts CHECK (subtotal >= 0 AND tax_amount >= 0 AND total_amount = subtotal + tax_amount),
  ADD CONSTRAINT payment_issued_lock CHECK ((status = 'Issued') = is_locked AND (status <> 'Issued' OR issued_at IS NOT NULL)),
  ADD CONSTRAINT payment_no_self_original CHECK (statement_id IS DISTINCT FROM original_statement_id);
CREATE UNIQUE INDEX payment_one_processing ON qtkd.payment_statement (contract_id, billing_period)
  WHERE status IN ('Draft','Calculated','Reconciled','Submitted','Approved','Signing','Signed','Revision');
ALTER TABLE qtkd.payment_statement_line
  ADD CONSTRAINT payment_line_amount CHECK (quantity >= 0 AND unit_price >= 0 AND amount = round(quantity * unit_price, 2));
ALTER TABLE qtkd.reconciliation
  ADD CONSTRAINT reconciliation_complete CHECK (completed_at IS NULL OR
    (volume_confirmed_by IS NOT NULL AND volume_confirmed_at IS NOT NULL AND price_confirmed_at IS NOT NULL
      AND customer_result IS NOT DISTINCT FROM 'Agreed' AND reconciled_by IS NOT NULL)),
  ADD CONSTRAINT reconciliation_disagreement CHECK (customer_result IS DISTINCT FROM 'Disagreed' OR nullif(btrim(customer_feedback),'') IS NOT NULL);

-- Exactly one target, consistent with the discriminator, for each polymorphic relationship.
ALTER TABLE qtkd.attachment ADD CONSTRAINT attachment_one_target CHECK (
  (record_type = 'Contract' AND contract_id IS NOT NULL AND statement_id IS NULL) OR
  (record_type = 'PaymentStatement' AND statement_id IS NOT NULL AND contract_id IS NULL));
ALTER TABLE qtkd.change_request
  ADD CONSTRAINT change_one_target CHECK (
    (record_type = 'Contract' AND contract_id IS NOT NULL AND statement_id IS NULL) OR
    (record_type = 'PaymentStatement' AND statement_id IS NOT NULL AND contract_id IS NULL)),
  ADD CONSTRAINT change_reason CHECK (btrim(reason) <> ''),
  ADD CONSTRAINT change_decision_time CHECK ((status = 'Pending' AND decided_at IS NULL) OR (status <> 'Pending' AND decided_at IS NOT NULL));
ALTER TABLE qtkd.approval_round
  ADD CONSTRAINT round_one_target CHECK (
    (record_type = 'Contract' AND contract_id IS NOT NULL AND statement_id IS NULL) OR
    (record_type = 'PaymentStatement' AND statement_id IS NOT NULL AND contract_id IS NULL)),
  ADD CONSTRAINT round_numbers CHECK (record_version > 0 AND round_no > 0),
  ADD CONSTRAINT round_snapshot_object CHECK (jsonb_typeof(record_snapshot) = 'object'),
  ADD CONSTRAINT round_end CHECK ((result = 'Running' AND ended_at IS NULL) OR (result <> 'Running' AND ended_at IS NOT NULL AND ended_at >= submitted_at));
CREATE UNIQUE INDEX round_one_running_contract ON qtkd.approval_round (contract_id) WHERE result = 'Running' AND contract_id IS NOT NULL;
CREATE UNIQUE INDEX round_one_running_payment ON qtkd.approval_round (statement_id) WHERE result = 'Running' AND statement_id IS NOT NULL;
ALTER TABLE qtkd.approval_step
  ADD CONSTRAINT step_order_positive CHECK (step_order > 0),
  ADD CONSTRAINT step_decision CHECK (
    (step_status = 'Completed' AND decision IS NOT NULL AND decided_at IS NOT NULL
      AND decided_by IS NOT NULL AND decided_by = assignee_id AND nullif(btrim(comment),'') IS NOT NULL) OR
    (step_status <> 'Completed' AND decision IS NULL AND decided_at IS NULL AND decided_by IS NULL)),
  ADD CONSTRAINT step_assignment CHECK (step_status NOT IN ('Pending','Reviewing') OR assigned_at IS NOT NULL);
CREATE UNIQUE INDEX step_one_current ON qtkd.approval_step (round_id) WHERE step_status IN ('Pending','Reviewing');
ALTER TABLE qtkd.signing_session
  ADD CONSTRAINT signing_one_target CHECK (
    (record_type = 'Contract' AND contract_id IS NOT NULL AND statement_id IS NULL) OR
    (record_type = 'PaymentStatement' AND statement_id IS NOT NULL AND contract_id IS NULL)),
  ADD CONSTRAINT signing_success CHECK (status <> 'Succeeded' OR
    (company_signed_at IS NOT NULL AND customer_signed_at IS NOT NULL AND signed_file_id IS NOT NULL AND result_at IS NOT NULL)),
  ADD CONSTRAINT signing_failure_reason CHECK (status NOT IN ('Failed','Cancelled') OR nullif(btrim(reason),'') IS NOT NULL);
CREATE UNIQUE INDEX signing_one_contract ON qtkd.signing_session (contract_id) WHERE status = 'Signing' AND contract_id IS NOT NULL;
CREATE UNIQUE INDEX signing_one_payment ON qtkd.signing_session (statement_id) WHERE status = 'Signing' AND statement_id IS NOT NULL;

CREATE FUNCTION qtkd.reject_history_mutation() RETURNS trigger LANGUAGE plpgsql
SET search_path = pg_catalog, qtkd AS $$
BEGIN
  RAISE EXCEPTION 'History is append-only: %', TG_TABLE_NAME USING ERRCODE = '23514';
END;
$$;
CREATE TRIGGER audit_append_only BEFORE UPDATE OR DELETE OR TRUNCATE ON qtkd.audit_log
  FOR EACH STATEMENT EXECUTE FUNCTION qtkd.reject_history_mutation();

CREATE FUNCTION qtkd.guard_customer() RETURNS trigger LANGUAGE plpgsql
SET search_path = pg_catalog, qtkd AS $$
BEGIN
  IF NEW.customer_id IS DISTINCT FROM OLD.customer_id OR NEW.tax_code IS DISTINCT FROM OLD.tax_code THEN
    RAISE EXCEPTION 'Customer identity and tax code are immutable' USING ERRCODE = '23514';
  END IF;
  NEW.version := OLD.version + CASE WHEN (to_jsonb(NEW) - 'version') IS DISTINCT FROM (to_jsonb(OLD) - 'version') THEN 1 ELSE 0 END;
  RETURN NEW;
END;
$$;
CREATE TRIGGER customer_guard BEFORE UPDATE ON qtkd.customer FOR EACH ROW EXECUTE FUNCTION qtkd.guard_customer();

-- Serialize tree edits, derive level/path, propagate descendant paths atomically.
CREATE FUNCTION qtkd.guard_area_tree() RETURNS trigger LANGUAGE plpgsql
SET search_path = pg_catalog, qtkd AS $$
DECLARE parent qtkd.area; cycle_found boolean;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('qtkd.area.tree', 0));
  IF NEW.parent_area_id IS NULL THEN
    NEW.level := 1; NEW.hierarchy_path := '/' || NEW.area_code;
  ELSE
    WITH RECURSIVE ancestors AS (
      SELECT a.area_id, a.parent_area_id FROM qtkd.area a WHERE a.area_id = NEW.parent_area_id
      UNION
      SELECT a.area_id, a.parent_area_id FROM qtkd.area a JOIN ancestors p ON a.area_id = p.parent_area_id
    ) SELECT EXISTS (SELECT 1 FROM ancestors WHERE area_id = NEW.area_id) INTO cycle_found;
    IF cycle_found THEN RAISE EXCEPTION 'Area hierarchy cycle' USING ERRCODE = '23514'; END IF;
    SELECT * INTO STRICT parent FROM qtkd.area WHERE area_id = NEW.parent_area_id;
    NEW.level := parent.level + 1; NEW.hierarchy_path := parent.hierarchy_path || '/' || NEW.area_code;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NEW.area_code IS DISTINCT FROM OLD.area_code AND (
      EXISTS (SELECT 1 FROM qtkd.contract_item WHERE area_id = OLD.area_id) OR
      EXISTS (SELECT 1 FROM qtkd.price_list_line WHERE area_id = OLD.area_id) OR
      EXISTS (SELECT 1 FROM qtkd.volume_line WHERE area_id = OLD.area_id)) THEN
      RAISE EXCEPTION 'Referenced area code is immutable' USING ERRCODE = '23514';
    END IF;
    NEW.row_version := OLD.row_version + CASE WHEN (to_jsonb(NEW) - 'row_version') IS DISTINCT FROM (to_jsonb(OLD) - 'row_version') THEN 1 ELSE 0 END;
  END IF;
  RETURN NEW;
END;
$$;
CREATE FUNCTION qtkd.refresh_area_descendants() RETURNS trigger LANGUAGE plpgsql
SET search_path = pg_catalog, qtkd AS $$
BEGIN
  IF NEW.hierarchy_path IS DISTINCT FROM OLD.hierarchy_path OR NEW.level IS DISTINCT FROM OLD.level THEN
    UPDATE qtkd.area SET parent_area_id = NEW.area_id WHERE parent_area_id = NEW.area_id;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER area_tree BEFORE INSERT OR UPDATE ON qtkd.area FOR EACH ROW EXECUTE FUNCTION qtkd.guard_area_tree();
CREATE TRIGGER area_descendants AFTER UPDATE ON qtkd.area FOR EACH ROW EXECUTE FUNCTION qtkd.refresh_area_descendants();

CREATE FUNCTION qtkd.guard_contract_content() RETURNS trigger LANGUAGE plpgsql
SET search_path = pg_catalog, qtkd AS $$
DECLARE changed boolean;
BEGIN
  changed := (to_jsonb(NEW) - ARRAY['status','version','updated_at']) IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['status','version','updated_at']);
  IF changed AND OLD.status NOT IN ('Draft','RevisionRequested') THEN
    RAISE EXCEPTION 'Contract content can only change in Draft or RevisionRequested' USING ERRCODE = '23514';
  END IF;
  NEW.version := OLD.version + CASE WHEN changed THEN 1 ELSE 0 END;
  NEW.updated_at := CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$;
CREATE TRIGGER contract_content BEFORE UPDATE ON qtkd.contract FOR EACH ROW EXECUTE FUNCTION qtkd.guard_contract_content();

CREATE FUNCTION qtkd.guard_approval_history() RETURNS trigger LANGUAGE plpgsql
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
    IF OLD.decision IS NOT NULL OR NEW.assignee_id IS DISTINCT FROM OLD.assignee_id OR NEW.round_id <> OLD.round_id OR NEW.step_order <> OLD.step_order THEN
      RAISE EXCEPTION 'Decision, assignee and order cannot be rewritten' USING ERRCODE = '23514';
    END IF;
    -- Lock the round so decisions on different rows cannot skip concurrent steps.
    PERFORM 1 FROM qtkd.approval_round WHERE round_id = NEW.round_id AND result = 'Running' FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Approval round is closed' USING ERRCODE = '23514'; END IF;
    IF NEW.step_status IN ('Pending','Reviewing','Completed') AND EXISTS (
      SELECT 1 FROM qtkd.approval_step WHERE round_id = NEW.round_id AND step_order < NEW.step_order
        AND (step_status <> 'Completed' OR decision IS DISTINCT FROM 'Approve')) THEN
      RAISE EXCEPTION 'Cannot skip approval steps' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER round_history BEFORE UPDATE OR DELETE ON qtkd.approval_round FOR EACH ROW EXECUTE FUNCTION qtkd.guard_approval_history();
CREATE TRIGGER step_history BEFORE UPDATE OR DELETE ON qtkd.approval_step FOR EACH ROW EXECUTE FUNCTION qtkd.guard_approval_history();

-- This database is accessed by the .NET backend via a server-side DB connection.
-- No frontend access, Supabase Auth mapping, or broad RLS policies are assumed.
DO $$
DECLARE tab record; role_name text;
BEGIN
  FOR tab IN SELECT tablename FROM pg_tables WHERE schemaname = 'qtkd' LOOP
    EXECUTE format('ALTER TABLE qtkd.%I ENABLE ROW LEVEL SECURITY', tab.tablename);
    EXECUTE format('REVOKE ALL ON TABLE qtkd.%I FROM PUBLIC', tab.tablename);
  END LOOP;
  REVOKE ALL ON SCHEMA qtkd FROM PUBLIC;
  REVOKE ALL ON ALL FUNCTIONS IN SCHEMA qtkd FROM PUBLIC;
  FOREACH role_name IN ARRAY ARRAY['anon','authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      EXECUTE format('REVOKE ALL ON SCHEMA qtkd FROM %I', role_name);
      EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA qtkd FROM %I', role_name);
      EXECUTE format('REVOKE ALL ON ALL FUNCTIONS IN SCHEMA qtkd FROM %I', role_name);
    END IF;
  END LOOP;
END;
$$;

COMMIT;
