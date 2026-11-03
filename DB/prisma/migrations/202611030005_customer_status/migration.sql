BEGIN;

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
COMMIT;
