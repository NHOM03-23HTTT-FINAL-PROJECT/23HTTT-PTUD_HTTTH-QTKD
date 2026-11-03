-- SYS-CTR-10 / US-CTR-29. Additive migration; deploy through Prisma only.
-- One row per participant-configuration version. A running approval round keeps its own
-- snapshot in approval_round.record_snapshot, so activating a new version never changes it.
BEGIN;
CREATE TABLE "qtkd"."workflow_config" (
    "config_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" VARCHAR(32) NOT NULL,
    "version" INTEGER NOT NULL,
    "config_name" VARCHAR(200) NOT NULL,
    "doc_type" VARCHAR(32) NOT NULL,
    "department_id" UUID NOT NULL,
    "stages" JSONB NOT NULL,
    "change_summary" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "activated_by" UUID NOT NULL,
    "activated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workflow_config_pkey" PRIMARY KEY ("config_id")
);
CREATE INDEX "workflow_config_department_id_idx" ON "qtkd"."workflow_config"("department_id");
CREATE INDEX "workflow_config_activated_by_idx" ON "qtkd"."workflow_config"("activated_by");
CREATE UNIQUE INDEX "workflow_config_code_version_key" ON "qtkd"."workflow_config"("code", "version");
ALTER TABLE "qtkd"."workflow_config" ADD CONSTRAINT "workflow_config_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "qtkd"."department"("department_id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "qtkd"."workflow_config" ADD CONSTRAINT "workflow_config_activated_by_fkey" FOREIGN KEY ("activated_by") REFERENCES "qtkd"."user_account"("user_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "qtkd"."workflow_config"
  ADD CONSTRAINT workflow_config_doc_type CHECK (doc_type IN ('contract', 'appendix', 'cancel-agreement', 'termination')),
  ADD CONSTRAINT workflow_config_version_positive CHECK (version >= 1),
  ADD CONSTRAINT workflow_config_nonblank CHECK (btrim(code) <> '' AND btrim(config_name) <> '' AND btrim(change_summary) <> ''),
  ADD CONSTRAINT workflow_config_stages_array CHECK (jsonb_typeof(stages) = 'array' AND jsonb_array_length(stages) > 0);
-- Exactly one active version per document type + department scope, and per configuration code.
CREATE UNIQUE INDEX "workflow_config_active_scope_key" ON "qtkd"."workflow_config"("doc_type", "department_id") WHERE is_active;
CREATE UNIQUE INDEX "workflow_config_active_code_key" ON "qtkd"."workflow_config"("code") WHERE is_active;

-- Versions are history: never deleted or rewritten. The only allowed change is deactivation.
CREATE OR REPLACE FUNCTION qtkd.guard_workflow_config() RETURNS trigger LANGUAGE plpgsql
SET search_path = pg_catalog, qtkd AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Workflow configuration versions cannot be deleted' USING ERRCODE = '23514'; END IF;
  IF (to_jsonb(NEW) - 'is_active') IS DISTINCT FROM (to_jsonb(OLD) - 'is_active') OR (NEW.is_active AND NOT OLD.is_active) THEN
    RAISE EXCEPTION 'Workflow configuration versions are immutable; only deactivation is allowed' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER workflow_config_history BEFORE UPDATE OR DELETE ON "qtkd"."workflow_config" FOR EACH ROW EXECUTE FUNCTION qtkd.guard_workflow_config();

-- Same server-side-only access model as the other qtkd tables (202611020002_constraints).
ALTER TABLE "qtkd"."workflow_config" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "qtkd"."workflow_config" FROM PUBLIC;
REVOKE ALL ON FUNCTION qtkd.guard_workflow_config() FROM PUBLIC;
DO $$
DECLARE role_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon','authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      EXECUTE format('REVOKE ALL ON TABLE qtkd.workflow_config FROM %I', role_name);
      EXECUTE format('REVOKE ALL ON FUNCTION qtkd.guard_workflow_config() FROM %I', role_name);
    END IF;
  END LOOP;
END;
$$;
COMMIT;
