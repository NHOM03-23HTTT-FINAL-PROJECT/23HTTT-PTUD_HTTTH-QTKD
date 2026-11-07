-- The contracts migration already creates customer_code, its sequence and index.
CREATE OR REPLACE FUNCTION qtkd.guard_customer() RETURNS trigger LANGUAGE plpgsql
SET search_path = pg_catalog, qtkd AS $$
BEGIN
  IF NEW.customer_id IS DISTINCT FROM OLD.customer_id OR NEW.tax_code IS DISTINCT FROM OLD.tax_code
    OR NEW.customer_code IS DISTINCT FROM OLD.customer_code THEN
    RAISE EXCEPTION 'Customer identity, code and tax code are immutable' USING ERRCODE = '23514';
  END IF;
  NEW.version := OLD.version + CASE WHEN (to_jsonb(NEW) - 'version') IS DISTINCT FROM (to_jsonb(OLD) - 'version') THEN 1 ELSE 0 END;
  RETURN NEW;
END;
$$;
ALTER TABLE "qtkd"."customer" ADD COLUMN "customer_updated_at" TIMESTAMPTZ(6);
ALTER TABLE "qtkd"."customer" ADD COLUMN "flow_revision" INTEGER NOT NULL DEFAULT 0;

-- Keep legacy data unchanged. The absence of a row means its creation metadata
-- and structured service groups are unknown, not an invented timestamp/user.
CREATE TABLE "qtkd"."customer_profile_data" (
  "customer_id" UUID NOT NULL,
  "service_groups" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "created_at" TIMESTAMPTZ(6),
  "created_by" UUID,
  "updated_at" TIMESTAMPTZ(6),
  CONSTRAINT "customer_profile_data_pkey" PRIMARY KEY ("customer_id")
);
ALTER TABLE "qtkd"."customer_profile_data" ADD CONSTRAINT "customer_profile_data_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "qtkd"."customer"("customer_id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "qtkd"."customer_profile_data" ADD CONSTRAINT "customer_profile_data_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "qtkd"."user_account"("user_id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE qtkd.customer_profile_data ADD CONSTRAINT customer_profile_services_present CHECK (service_groups IS NOT NULL);

-- Written in the same transaction as a successful operation and its audit.
CREATE TABLE "qtkd"."customer_operation" (
  "actor_id" UUID NOT NULL,
  "operation" VARCHAR(40) NOT NULL,
  "request_key" VARCHAR(100) NOT NULL,
  "request_hash" VARCHAR(64) NOT NULL,
  "customer_id" UUID NOT NULL,
  "response" JSONB NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "customer_operation_pkey" PRIMARY KEY ("actor_id","operation","request_key")
);
CREATE INDEX "customer_operation_customer_id_idx" ON "qtkd"."customer_operation"("customer_id");
ALTER TABLE "qtkd"."customer_operation" ADD CONSTRAINT "customer_operation_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "qtkd"."user_account"("user_id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "qtkd"."customer_operation" ADD CONSTRAINT "customer_operation_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "qtkd"."customer"("customer_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE qtkd.customer_profile_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE qtkd.customer_operation ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON qtkd.customer_profile_data, qtkd.customer_operation FROM PUBLIC;
DO $$ DECLARE r text; BEGIN
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('REVOKE ALL ON qtkd.customer_profile_data, qtkd.customer_operation FROM %I', r);
    END IF;
  END LOOP;
END $$;

-- Existing decisions remain valid; legacy rows have no structured review data.
ALTER TABLE "qtkd"."customer_status_decision" ADD COLUMN "review_metadata" JSONB;

-- Persist a notification request atomically with the decision. Delivery is a
-- separate operation; no notification is reported as sent by this migration.
CREATE TABLE "qtkd"."customer_status_outbox" (
  "decision_id" UUID NOT NULL,
  "payload" JSONB NOT NULL,
  "status" VARCHAR(20) NOT NULL DEFAULT 'Pending',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "customer_status_outbox_pkey" PRIMARY KEY ("decision_id")
);
ALTER TABLE "qtkd"."customer_status_outbox" ADD CONSTRAINT "customer_status_outbox_decision_id_fkey"
  FOREIGN KEY ("decision_id") REFERENCES "qtkd"."customer_status_decision"("decision_id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "qtkd"."customer_status_outbox" ADD CONSTRAINT "customer_status_outbox_status" CHECK (status IN ('Pending', 'Sent', 'Failed')),
  ADD CONSTRAINT "customer_status_outbox_attempts" CHECK (attempts >= 0);
ALTER TABLE qtkd.customer_status_outbox ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON qtkd.customer_status_outbox FROM PUBLIC;
DO $$ DECLARE r text; BEGIN
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('REVOKE ALL ON qtkd.customer_status_outbox FROM %I', r);
    END IF;
  END LOOP;
END $$;

-- Each record grants one action to one person for their own assigned customers.
-- Expired/revoked records remain as history; grants are serialized by the API.
CREATE TABLE "qtkd"."customer_status_delegation" (
  "delegation_id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "grantee_id" UUID NOT NULL,
  "granted_by" UUID NOT NULL,
  "department_id" UUID NOT NULL,
  "action" "qtkd"."customer_decision_type" NOT NULL,
  "reason" TEXT,
  "granted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expires_at" TIMESTAMPTZ(6),
  "revoked_at" TIMESTAMPTZ(6),
  "revoked_by" UUID,
  CONSTRAINT "customer_status_delegation_pkey" PRIMARY KEY ("delegation_id"),
  CONSTRAINT "customer_status_delegation_expiry" CHECK ("expires_at" IS NULL OR "expires_at" > "granted_at"),
  CONSTRAINT "customer_status_delegation_revocation" CHECK (("revoked_at" IS NULL AND "revoked_by" IS NULL) OR ("revoked_at" IS NOT NULL AND "revoked_by" IS NOT NULL AND "revoked_at" >= "granted_at")),
  CONSTRAINT "customer_status_delegation_distinct_users" CHECK ("grantee_id" <> "granted_by")
);
ALTER TABLE "qtkd"."customer_status_delegation" ADD CONSTRAINT "customer_status_delegation_grantee_id_fkey" FOREIGN KEY ("grantee_id") REFERENCES "qtkd"."user_account"("user_id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "qtkd"."customer_status_delegation" ADD CONSTRAINT "customer_status_delegation_granted_by_fkey" FOREIGN KEY ("granted_by") REFERENCES "qtkd"."user_account"("user_id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "qtkd"."customer_status_delegation" ADD CONSTRAINT "customer_status_delegation_revoked_by_fkey" FOREIGN KEY ("revoked_by") REFERENCES "qtkd"."user_account"("user_id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "qtkd"."customer_status_delegation" ADD CONSTRAINT "customer_status_delegation_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "qtkd"."department"("department_id") ON DELETE RESTRICT ON UPDATE RESTRICT;
CREATE INDEX "customer_status_delegation_grantee_id_action_idx" ON "qtkd"."customer_status_delegation"("grantee_id", "action");
CREATE INDEX "customer_status_delegation_department_id_idx" ON "qtkd"."customer_status_delegation"("department_id");
ALTER TABLE qtkd.customer_status_delegation ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON qtkd.customer_status_delegation FROM PUBLIC;
DO $$ DECLARE r text; BEGIN
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('REVOKE ALL ON qtkd.customer_status_delegation FROM %I', r);
    END IF;
  END LOOP;
END $$;
