BEGIN;

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

COMMIT;
