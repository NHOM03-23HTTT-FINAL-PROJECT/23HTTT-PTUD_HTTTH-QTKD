BEGIN;
SET LOCAL search_path = qtkd, pg_catalog;
CREATE SEQUENCE qtkd.customer_code_seq;
CREATE SEQUENCE qtkd.service_code_seq;
CREATE SEQUENCE qtkd.contract_code_seq;
-- BEGIN PRISMA DIFF
-- AlterTable
ALTER TABLE "attachment" ADD COLUMN     "content_type" VARCHAR(200) NOT NULL DEFAULT 'application/octet-stream',
ADD COLUMN     "file_size" BIGINT NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "customer" ADD COLUMN     "customer_code" VARCHAR(50) NOT NULL DEFAULT ('KH-'::text || lpad((nextval('qtkd.customer_code_seq'::regclass))::text, 6, '0'::text));

-- AlterTable
ALTER TABLE "service" ADD COLUMN     "requires_area" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "service_code" VARCHAR(50) NOT NULL DEFAULT ('DV-'::text || lpad((nextval('qtkd.service_code_seq'::regclass))::text, 6, '0'::text));

-- AlterTable
ALTER TABLE "contract" ADD COLUMN     "cancellation_reason" TEXT,
ADD COLUMN     "cancelled_at" TIMESTAMPTZ(6),
ADD COLUMN     "cancelled_by" UUID,
ADD COLUMN     "contract_code" VARCHAR(50) NOT NULL DEFAULT ('HD-'::text || lpad((nextval('qtkd.contract_code_seq'::regclass))::text, 6, '0'::text)),
ADD COLUMN     "customer_snapshot" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "owning_department_id" UUID,
ADD COLUMN     "source_mode" VARCHAR(20) NOT NULL DEFAULT 'blank',
ADD COLUMN     "template_code" VARCHAR(80);

-- AlterTable
ALTER TABLE "contract_item" ALTER COLUMN "area_id" DROP NOT NULL;

-- CreateTable
CREATE TABLE "contract_cancellation_request" (
    "request_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "contract_id" UUID NOT NULL,
    "requested_by" UUID NOT NULL,
    "requested_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "party" VARCHAR(20) NOT NULL,
    "reason" TEXT NOT NULL,
    "original_status" "contract_status" NOT NULL,
    "contract_version" INTEGER NOT NULL,
    "status" VARCHAR(30) NOT NULL DEFAULT 'pending-sales',
    "sales_assignee_id" UUID NOT NULL,
    "sales_decided_at" TIMESTAMPTZ(6),
    "sales_approved" BOOLEAN,
    "sales_reason" TEXT,
    "board_assignee_id" UUID,
    "board_decided_at" TIMESTAMPTZ(6),
    "board_approved" BOOLEAN,
    "board_reason" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "contract_cancellation_request_pkey" PRIMARY KEY ("request_id")
);

-- CreateTable
CREATE TABLE "contract_delivery" (
    "delivery_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "contract_id" UUID NOT NULL,
    "request_id" UUID NOT NULL,
    "destination" VARCHAR(254) NOT NULL,
    "payload" JSONB NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'Pending',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "delivered_at" TIMESTAMPTZ(6),

    CONSTRAINT "contract_delivery_pkey" PRIMARY KEY ("delivery_id")
);

-- CreateTable
CREATE TABLE "idempotency_request" (
    "actor_id" UUID NOT NULL,
    "operation" VARCHAR(180) NOT NULL,
    "key" VARCHAR(128) NOT NULL,
    "fingerprint" VARCHAR(64) NOT NULL,
    "response" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "idempotency_request_pkey" PRIMARY KEY ("actor_id","operation","key")
);

-- CreateIndex
CREATE INDEX "contract_cancellation_request_contract_id_idx" ON "contract_cancellation_request"("contract_id");

-- CreateIndex
CREATE UNIQUE INDEX "contract_delivery_request_id_key" ON "contract_delivery"("request_id");

-- CreateIndex
CREATE UNIQUE INDEX "customer_customer_code_key" ON "customer"("customer_code");

-- CreateIndex
CREATE UNIQUE INDEX "service_service_code_key" ON "service"("service_code");

-- CreateIndex
CREATE UNIQUE INDEX "contract_contract_code_key" ON "contract"("contract_code");

-- AddForeignKey
ALTER TABLE "contract_cancellation_request" ADD CONSTRAINT "contract_cancellation_request_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "contract"("contract_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_cancellation_request" ADD CONSTRAINT "contract_cancellation_request_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "user_account"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_cancellation_request" ADD CONSTRAINT "contract_cancellation_request_sales_assignee_id_fkey" FOREIGN KEY ("sales_assignee_id") REFERENCES "user_account"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_cancellation_request" ADD CONSTRAINT "contract_cancellation_request_board_assignee_id_fkey" FOREIGN KEY ("board_assignee_id") REFERENCES "user_account"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_delivery" ADD CONSTRAINT "contract_delivery_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "contract"("contract_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_delivery" ADD CONSTRAINT "contract_delivery_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "contract_cancellation_request"("request_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- END PRISMA DIFF

-- Backfill existing records while replacing the previous content guard in the same transaction.
ALTER TABLE qtkd.contract DISABLE TRIGGER contract_content;
UPDATE qtkd.contract c SET owning_department_id=u.department_id,
 customer_snapshot=jsonb_build_object('code',cu.customer_code,'name',cu.customer_name,'taxCode',cu.tax_code,
  'address',cu.address,'representative',cu.legal_representative,'contactName',cu.contact_name,'email',cu.email,'phone',cu.phone)
FROM qtkd.user_account u,qtkd.customer cu WHERE u.user_id=c.owner_id AND cu.customer_id=c.customer_id;
ALTER TABLE qtkd.contract ENABLE TRIGGER contract_content;
ALTER TABLE qtkd.contract DROP CONSTRAINT contract_dates;
ALTER TABLE qtkd.contract ADD CONSTRAINT contract_dates CHECK(end_date>=start_date);
ALTER TABLE qtkd.contract ADD CONSTRAINT contract_source_mode CHECK(source_mode IN ('template','blank'));
ALTER TABLE qtkd.contract ADD CONSTRAINT contract_department_fk FOREIGN KEY(owning_department_id) REFERENCES qtkd.department(department_id) ON DELETE RESTRICT;
ALTER TABLE qtkd.contract ADD CONSTRAINT contract_cancelled_by_fk FOREIGN KEY(cancelled_by) REFERENCES qtkd.user_account(user_id) ON DELETE RESTRICT;
ALTER TABLE qtkd.attachment ADD CONSTRAINT attachment_size CHECK(file_size>=0 AND file_size<=20971520);
CREATE UNIQUE INDEX contract_file_name_unique ON qtkd.attachment(contract_id,lower(file_name)) WHERE contract_id IS NOT NULL;
DROP INDEX qtkd.contract_item_contract_id_service_id_area_id_key;
CREATE UNIQUE INDEX contract_item_contract_id_service_id_area_id_key ON qtkd.contract_item(contract_id,service_id,area_id) NULLS NOT DISTINCT;
CREATE UNIQUE INDEX cancellation_one_pending ON qtkd.contract_cancellation_request(contract_id) WHERE status IN ('pending-sales','pending-board');
ALTER TABLE qtkd.contract_cancellation_request
 ADD CONSTRAINT cancellation_party CHECK(party IN ('company','customer')),
 ADD CONSTRAINT cancellation_reason CHECK(btrim(reason)<>''),
 ADD CONSTRAINT cancellation_status CHECK(status IN ('pending-sales','pending-board','approved','rejected')),
 ADD CONSTRAINT cancellation_version CHECK(version>0 AND contract_version>0),
 ADD CONSTRAINT cancellation_source CHECK(original_status IN ('Submitted','UnderReview','RevisionRequested','Approved')),
 ADD CONSTRAINT cancellation_sales_decision CHECK((sales_decided_at IS NULL)=(sales_approved IS NULL)),
 ADD CONSTRAINT cancellation_board_decision CHECK((board_decided_at IS NULL)=(board_approved IS NULL)),
 ADD CONSTRAINT cancellation_rejection_reason CHECK((sales_approved IS DISTINCT FROM false OR nullif(btrim(sales_reason),'') IS NOT NULL)
  AND (board_approved IS DISTINCT FROM false OR nullif(btrim(board_reason),'') IS NOT NULL)),
 ADD CONSTRAINT cancellation_board_needed CHECK(original_status<>'Approved' OR board_assignee_id IS NOT NULL);
ALTER TABLE qtkd.contract_delivery ADD CONSTRAINT delivery_status CHECK(status IN ('Pending','Sent','Failed'));
ALTER TABLE qtkd.contract_delivery ADD CONSTRAINT delivery_attempts CHECK(attempts>=0);

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
 NEW.version:=OLD.version+CASE WHEN changed OR NEW.status<>OLD.status OR NEW.version=OLD.version+1 THEN 1 ELSE 0 END;
 NEW.updated_at:=CURRENT_TIMESTAMP;
 RETURN NEW;
END;
$$;

CREATE FUNCTION qtkd.guard_signing_contract() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,qtkd AS $$
DECLARE current_status qtkd.contract_status;
BEGIN
 IF NEW.contract_id IS NOT NULL AND NEW.status IN ('Signing','Succeeded') THEN
  SELECT status INTO current_status FROM qtkd.contract WHERE contract_id=NEW.contract_id FOR UPDATE;
  IF current_status='Cancelled' OR EXISTS(SELECT 1 FROM qtkd.contract_cancellation_request
   WHERE contract_id=NEW.contract_id AND status IN ('pending-sales','pending-board')) THEN
   RAISE EXCEPTION 'Signing is blocked while cancellation is pending or complete' USING ERRCODE='23514';
  END IF;
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER signing_contract_guard BEFORE INSERT OR UPDATE ON qtkd.signing_session FOR EACH ROW EXECUTE FUNCTION qtkd.guard_signing_contract();

DO $$
DECLARE name text; role_name text;
BEGIN
 FOREACH name IN ARRAY ARRAY['contract_cancellation_request','contract_delivery','idempotency_request'] LOOP
  EXECUTE format('ALTER TABLE qtkd.%I ENABLE ROW LEVEL SECURITY',name);
  EXECUTE format('REVOKE ALL ON TABLE qtkd.%I FROM PUBLIC',name);
  FOREACH role_name IN ARRAY ARRAY['anon','authenticated'] LOOP
   IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=role_name) THEN EXECUTE format('REVOKE ALL ON TABLE qtkd.%I FROM %I',name,role_name); END IF;
  END LOOP;
 END LOOP;
END;
$$;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA qtkd FROM PUBLIC;
REVOKE ALL ON FUNCTION qtkd.guard_signing_contract() FROM PUBLIC;
COMMIT;