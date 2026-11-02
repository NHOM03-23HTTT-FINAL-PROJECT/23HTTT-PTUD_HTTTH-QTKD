BEGIN;

CREATE SEQUENCE qtkd.customer_code_seq;
CREATE FUNCTION qtkd.next_customer_code() RETURNS text LANGUAGE sql VOLATILE
SET search_path = pg_catalog, qtkd AS $$
  SELECT 'KH-' || CASE WHEN length(n) < 6 THEN lpad(n, 6, '0') ELSE n END
  FROM (SELECT nextval('qtkd.customer_code_seq'::regclass)::text AS n) sequence_value
$$;
-- ALTER TABLE fills existing rows without firing the customer update trigger.
ALTER TABLE "qtkd"."customer" ADD COLUMN "customer_code" VARCHAR(30) NOT NULL DEFAULT qtkd.next_customer_code();
CREATE UNIQUE INDEX "customer_customer_code_key" ON "qtkd"."customer"("customer_code");
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
REVOKE ALL ON SEQUENCE qtkd.customer_code_seq FROM PUBLIC;
REVOKE ALL ON FUNCTION qtkd.next_customer_code() FROM PUBLIC;
DO $$ DECLARE r text; BEGIN
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('REVOKE ALL ON qtkd.customer_profile_data, qtkd.customer_operation FROM %I', r);
    END IF;
  END LOOP;
END $$;

COMMIT;
