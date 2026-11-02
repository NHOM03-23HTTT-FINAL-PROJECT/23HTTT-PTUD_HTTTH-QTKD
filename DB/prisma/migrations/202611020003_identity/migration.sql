-- TASK-022/023, ADR 0001-0003. Additive migration; deploy through Prisma only.
BEGIN;
ALTER TABLE "qtkd"."department" ADD COLUMN "code" VARCHAR(16);
UPDATE "qtkd"."department" SET "code" = CASE
 WHEN department_name ILIKE '%kinh doanh%' THEN 'KD'
 WHEN department_name ILIKE '%khai thác%' THEN 'KT'
 WHEN department_name ILIKE '%kế toán%' THEN 'KTOAN'
 WHEN department_name ILIKE '%pháp chế%' THEN 'PC'
 WHEN department_name ILIKE '%giám đốc%' THEN 'BGD'
 WHEN department_name ILIKE '%quản trị%' THEN 'QTHT'
 ELSE 'LEGACY_' || left(replace(department_id::text, '-', ''), 8) END;
-- Ambiguous departments intentionally fail the unique index and require mapping review.
ALTER TABLE "qtkd"."department" ALTER COLUMN "code" SET NOT NULL;
CREATE UNIQUE INDEX "department_code_key" ON "qtkd"."department"("code");
ALTER TABLE "qtkd"."user_account" ADD COLUMN "password_changed_at" TIMESTAMPTZ(6);
ALTER TABLE "qtkd"."login_session" ADD COLUMN "logout_token_hash" VARCHAR(256);
UPDATE "qtkd"."login_session" SET "logout_token_hash" = "refresh_token_hash";
ALTER TABLE "qtkd"."login_session" ALTER COLUMN "logout_token_hash" SET NOT NULL;
CREATE UNIQUE INDEX "login_session_logout_token_hash_key" ON "qtkd"."login_session"("logout_token_hash");
ALTER TABLE "qtkd"."login_session" ADD COLUMN "last_activity_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP;
UPDATE "qtkd"."login_session" SET "last_activity_at" = "created_at";
ALTER TABLE "qtkd"."login_session" ADD COLUMN "remember" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "qtkd"."login_session" ADD COLUMN "revocation_reason" VARCHAR(50);
ALTER TABLE "qtkd"."login_session" ADD CONSTRAINT "session_activity_dates" CHECK (last_activity_at >= created_at AND last_activity_at <= expires_at);
CREATE TABLE "qtkd"."role_definition" (
 "code" "qtkd"."user_role" NOT NULL,
 "name" VARCHAR(100) NOT NULL,
 "department_code" VARCHAR(16) NOT NULL,
 CONSTRAINT "role_definition_pkey" PRIMARY KEY ("code")
);
CREATE TABLE "qtkd"."permission" (
 "code" VARCHAR(100) NOT NULL,
 "name" VARCHAR(200) NOT NULL,
 CONSTRAINT "permission_pkey" PRIMARY KEY ("code")
);
CREATE TABLE "qtkd"."role_permission" (
 "role" "qtkd"."user_role" NOT NULL,
 "permission_code" VARCHAR(100) NOT NULL,
 CONSTRAINT "role_permission_pkey" PRIMARY KEY ("role", "permission_code")
);
INSERT INTO "qtkd"."role_definition" (code, name, department_code) VALUES
 ('SalesStaff','Nhân viên Kinh doanh','KD'), ('SalesManager','Trưởng phòng Kinh doanh','KD'),
 ('OperationsStaff','Nhân viên Khai thác','KT'), ('OperationsManager','Trưởng phòng Khai thác','KT'),
 ('Accountant','Nhân viên Kế toán','KTOAN'), ('LegalStaff','Nhân viên Pháp chế','PC'),
 ('BoardMember','Ban Giám đốc','BGD'), ('SystemAdmin','Quản trị hệ thống','QTHT');
INSERT INTO "qtkd"."permission" (code, name) SELECT code, code FROM unnest(ARRAY[
 'customers.view','customers.create','customers.update','customers.change-status','contracts.view','contracts.create',
 'approvals.track','approvals.review-legal','approvals.approve','areas.view','areas.create','areas.update','areas.manage',
 'payments.view','users.manage','departments.manage','roles.manage','workflows.manage','audit.view','catalogs.manage']) AS code;
WITH grants(role, permission_code) AS (
 SELECT 'SalesStaff', unnest(ARRAY['customers.view','customers.create','customers.update','contracts.view','contracts.create','approvals.track','areas.view']) UNION ALL
 SELECT 'SalesManager', unnest(ARRAY['customers.view','customers.update','customers.change-status','contracts.view','approvals.track','approvals.approve','areas.view']) UNION ALL
 SELECT 'OperationsStaff', unnest(ARRAY['areas.view','areas.create','areas.update']) UNION ALL
 SELECT 'OperationsManager', unnest(ARRAY['areas.view','areas.create','areas.update','areas.manage']) UNION ALL
 SELECT 'LegalStaff', unnest(ARRAY['contracts.view','approvals.track','approvals.review-legal']) UNION ALL
 SELECT 'BoardMember', unnest(ARRAY['contracts.view','approvals.track','approvals.approve']) UNION ALL
 SELECT 'SystemAdmin', unnest(ARRAY['users.manage','departments.manage','roles.manage','workflows.manage','audit.view','catalogs.manage'])
) INSERT INTO "qtkd"."role_permission" SELECT role::qtkd.user_role, permission_code FROM grants;
ALTER TABLE "qtkd"."user_account" ADD CONSTRAINT "user_account_role_fkey" FOREIGN KEY ("role") REFERENCES "qtkd"."role_definition"("code") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "qtkd"."role_permission" ADD CONSTRAINT "role_permission_role_fkey" FOREIGN KEY ("role") REFERENCES "qtkd"."role_definition"("code") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "qtkd"."role_permission" ADD CONSTRAINT "role_permission_permission_code_fkey" FOREIGN KEY ("permission_code") REFERENCES "qtkd"."permission"("code") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "qtkd"."role_definition" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "qtkd"."permission" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "qtkd"."role_permission" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "qtkd"."role_definition", "qtkd"."permission", "qtkd"."role_permission" FROM PUBLIC;
DO $$ DECLARE r text; BEGIN
 FOREACH r IN ARRAY ARRAY['anon','authenticated'] LOOP
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
   EXECUTE format('REVOKE ALL ON qtkd.role_definition, qtkd.permission, qtkd.role_permission FROM %I', r);
  END IF;
 END LOOP;
END $$;
COMMIT;
