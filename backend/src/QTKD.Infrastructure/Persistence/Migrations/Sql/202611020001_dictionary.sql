BEGIN;

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "qtkd";
-- Offline Prisma diff renders the primary schema's identifiers without qualification.
SET LOCAL search_path = qtkd, pg_catalog;

-- CreateEnum
CREATE TYPE "user_role" AS ENUM ('SalesStaff', 'SalesManager', 'OperationsStaff', 'OperationsManager', 'Accountant', 'LegalStaff', 'BoardMember', 'SystemAdmin');

-- CreateEnum
CREATE TYPE "user_status" AS ENUM ('Active', 'TemporarilyLocked', 'Disabled');

-- CreateEnum
CREATE TYPE "session_end_reason" AS ENUM ('Logout', 'Expired', 'Revoked');

-- CreateEnum
CREATE TYPE "record_type" AS ENUM ('Contract', 'PaymentStatement', 'Customer', 'Area', 'PriceList', 'VolumePeriod', 'UserAccount');

-- CreateEnum
CREATE TYPE "document_record_type" AS ENUM ('Contract', 'PaymentStatement');

-- CreateEnum
CREATE TYPE "send_status" AS ENUM ('Pending', 'Sent', 'Failed');

-- CreateEnum
CREATE TYPE "active_status" AS ENUM ('Active', 'Suspended');

-- CreateEnum
CREATE TYPE "customer_decision_type" AS ENUM ('Suspend', 'Reactivate');

-- CreateEnum
CREATE TYPE "contract_document_type" AS ENUM ('Contract', 'Appendix', 'CancellationAgreement', 'TerminationRecord');

-- CreateEnum
CREATE TYPE "contract_status" AS ENUM ('Draft', 'Submitted', 'UnderReview', 'RevisionRequested', 'Rejected', 'Approved', 'Cancelled', 'Active');

-- CreateEnum
CREATE TYPE "price_list_status" AS ENUM ('Draft', 'Approved', 'Effective', 'Expired');

-- CreateEnum
CREATE TYPE "volume_status" AS ENUM ('Draft', 'Confirmed', 'Locked');

-- CreateEnum
CREATE TYPE "payment_status" AS ENUM ('Draft', 'Calculated', 'Reconciled', 'Submitted', 'Approved', 'Signing', 'Signed', 'Issued', 'Rejected', 'Revision', 'Cancelled');

-- CreateEnum
CREATE TYPE "customer_result" AS ENUM ('Agreed', 'Disagreed');

-- CreateEnum
CREATE TYPE "change_request_type" AS ENUM ('Revision', 'Cancellation', 'Withdrawal');

-- CreateEnum
CREATE TYPE "change_request_status" AS ENUM ('Pending', 'Approved', 'Rejected');

-- CreateEnum
CREATE TYPE "approval_result" AS ENUM ('Running', 'Completed', 'RevisionRequested', 'Rejected', 'Withdrawn');

-- CreateEnum
CREATE TYPE "approval_step_status" AS ENUM ('NotStarted', 'Pending', 'Reviewing', 'Completed', 'Skipped');

-- CreateEnum
CREATE TYPE "approval_decision" AS ENUM ('Approve', 'RequestRevision', 'Reject');

-- CreateEnum
CREATE TYPE "signing_status" AS ENUM ('Signing', 'Succeeded', 'Failed', 'Cancelled');

-- CreateTable
CREATE TABLE "department" (
    "department_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "department_name" VARCHAR(200) NOT NULL,
    "manager_id" UUID,

    CONSTRAINT "department_pkey" PRIMARY KEY ("department_id")
);

-- CreateTable
CREATE TABLE "user_account" (
    "user_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "username" VARCHAR(100) NOT NULL,
    "company_email" VARCHAR(254) NOT NULL,
    "password_hash" TEXT NOT NULL,
    "full_name" VARCHAR(200) NOT NULL,
    "department_id" UUID NOT NULL,
    "role" "user_role" NOT NULL,
    "status" "user_status" NOT NULL DEFAULT 'Active',
    "failed_login_count" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMPTZ(6),
    "must_change_password" BOOLEAN NOT NULL DEFAULT true,
    "can_sign" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "user_account_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "login_session" (
    "session_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "refresh_token_hash" VARCHAR(256) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "is_revoked" BOOLEAN NOT NULL DEFAULT false,
    "end_reason" "session_end_reason",
    "ip_address" VARCHAR(45),
    "device" VARCHAR(500),

    CONSTRAINT "login_session_pkey" PRIMARY KEY ("session_id")
);

-- CreateTable
CREATE TABLE "password_otp" (
    "otp_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "otp_hash" VARCHAR(256) NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "failed_count" INTEGER NOT NULL DEFAULT 0,
    "is_used" BOOLEAN NOT NULL DEFAULT false,
    "sent_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_otp_pkey" PRIMARY KEY ("otp_id")
);

-- CreateTable
CREATE TABLE "notification" (
    "notification_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "recipient_id" UUID NOT NULL,
    "record_type" "record_type" NOT NULL,
    "record_id" UUID NOT NULL,
    "content" TEXT NOT NULL,
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "send_status" "send_status" NOT NULL DEFAULT 'Pending',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_pkey" PRIMARY KEY ("notification_id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "log_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "entity_type" VARCHAR(100) NOT NULL,
    "entity_id" UUID,
    "action" VARCHAR(100) NOT NULL,
    "actor_id" UUID,
    "acted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status_before" VARCHAR(50),
    "status_after" VARCHAR(50),
    "value_before" JSONB,
    "value_after" JSONB,
    "note" TEXT,
    "ip_address" VARCHAR(45),

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("log_id")
);

-- CreateTable
CREATE TABLE "attachment" (
    "attachment_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "record_type" "document_record_type" NOT NULL,
    "contract_id" UUID,
    "statement_id" UUID,
    "file_name" VARCHAR(255) NOT NULL,
    "file_path" TEXT NOT NULL,
    "uploaded_by" UUID NOT NULL,
    "uploaded_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attachment_pkey" PRIMARY KEY ("attachment_id")
);

-- CreateTable
CREATE TABLE "customer" (
    "customer_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "customer_name" VARCHAR(250) NOT NULL,
    "tax_code" VARCHAR(13) NOT NULL,
    "address" TEXT NOT NULL,
    "legal_representative" VARCHAR(200) NOT NULL,
    "contact_name" VARCHAR(200),
    "contact_title" VARCHAR(150),
    "phone" VARCHAR(30),
    "email" VARCHAR(254),
    "customer_group" VARCHAR(100),
    "interested_services" TEXT,
    "status" "active_status" NOT NULL DEFAULT 'Active',
    "account_manager_id" UUID NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "customer_pkey" PRIMARY KEY ("customer_id")
);

-- CreateTable
CREATE TABLE "customer_status_decision" (
    "decision_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "customer_id" UUID NOT NULL,
    "decision_type" "customer_decision_type" NOT NULL,
    "reason" TEXT NOT NULL,
    "basis" TEXT,
    "follow_up_plan" TEXT,
    "confirmed_by" UUID NOT NULL,
    "decided_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_status_decision_pkey" PRIMARY KEY ("decision_id")
);

-- CreateTable
CREATE TABLE "area" (
    "area_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "area_code" VARCHAR(50) NOT NULL,
    "area_name" VARCHAR(200) NOT NULL,
    "area_type" VARCHAR(100) NOT NULL,
    "parent_area_id" UUID,
    "level" INTEGER NOT NULL DEFAULT 1,
    "hierarchy_path" TEXT NOT NULL,
    "coordinates" TEXT,
    "area_m2" DECIMAL(19,4) NOT NULL,
    "capacity" DECIMAL(19,4) NOT NULL,
    "technical_description" TEXT,
    "status" "active_status" NOT NULL DEFAULT 'Active',
    "row_version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "area_pkey" PRIMARY KEY ("area_id")
);

-- CreateTable
CREATE TABLE "service" (
    "service_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "service_name" VARCHAR(200) NOT NULL,
    "unit" VARCHAR(50) NOT NULL,
    "is_mandatory" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "service_pkey" PRIMARY KEY ("service_id")
);

-- CreateTable
CREATE TABLE "area_service" (
    "area_id" UUID NOT NULL,
    "service_id" UUID NOT NULL,

    CONSTRAINT "area_service_pkey" PRIMARY KEY ("area_id","service_id")
);

-- CreateTable
CREATE TABLE "area_assignment" (
    "assignment_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "area_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "from_date" TIMESTAMPTZ(6) NOT NULL,
    "to_date" TIMESTAMPTZ(6),

    CONSTRAINT "area_assignment_pkey" PRIMARY KEY ("assignment_id")
);

-- CreateTable
CREATE TABLE "contract" (
    "contract_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "document_type" "contract_document_type" NOT NULL DEFAULT 'Contract',
    "parent_contract_id" UUID,
    "customer_id" UUID NOT NULL,
    "title" VARCHAR(500) NOT NULL,
    "contract_type" VARCHAR(100) NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "contract_value" DECIMAL(19,2) NOT NULL,
    "payment_terms" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "status" "contract_status" NOT NULL DEFAULT 'Draft',
    "owner_id" UUID NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contract_pkey" PRIMARY KEY ("contract_id")
);

-- CreateTable
CREATE TABLE "contract_item" (
    "item_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "contract_id" UUID NOT NULL,
    "service_id" UUID NOT NULL,
    "area_id" UUID NOT NULL,
    "area_name_snapshot" VARCHAR(200) NOT NULL,

    CONSTRAINT "contract_item_pkey" PRIMARY KEY ("item_id")
);

-- CreateTable
CREATE TABLE "price_list" (
    "price_list_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "contract_id" UUID NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "effective_from" DATE NOT NULL,
    "effective_to" DATE NOT NULL,
    "status" "price_list_status" NOT NULL DEFAULT 'Draft',
    "created_by" UUID NOT NULL,

    CONSTRAINT "price_list_pkey" PRIMARY KEY ("price_list_id")
);

-- CreateTable
CREATE TABLE "price_list_line" (
    "line_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "price_list_id" UUID NOT NULL,
    "service_id" UUID NOT NULL,
    "area_id" UUID NOT NULL,
    "unit_price" DECIMAL(19,2) NOT NULL,
    "unit" VARCHAR(50) NOT NULL,

    CONSTRAINT "price_list_line_pkey" PRIMARY KEY ("line_id")
);

-- CreateTable
CREATE TABLE "volume_period" (
    "volume_period_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "contract_id" UUID NOT NULL,
    "billing_period" VARCHAR(7) NOT NULL,
    "status" "volume_status" NOT NULL DEFAULT 'Draft',
    "locked_by" UUID,
    "locked_at" TIMESTAMPTZ(6),

    CONSTRAINT "volume_period_pkey" PRIMARY KEY ("volume_period_id")
);

-- CreateTable
CREATE TABLE "volume_line" (
    "volume_line_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "volume_period_id" UUID NOT NULL,
    "service_id" UUID NOT NULL,
    "area_id" UUID NOT NULL,
    "quantity" DECIMAL(19,4) NOT NULL,

    CONSTRAINT "volume_line_pkey" PRIMARY KEY ("volume_line_id")
);

-- CreateTable
CREATE TABLE "payment_statement" (
    "statement_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "contract_id" UUID NOT NULL,
    "billing_period" VARCHAR(7) NOT NULL,
    "price_list_id" UUID NOT NULL,
    "volume_period_id" UUID NOT NULL,
    "customer_name_snapshot" VARCHAR(250) NOT NULL,
    "tax_code_snapshot" VARCHAR(13) NOT NULL,
    "address_snapshot" TEXT NOT NULL,
    "representative_snapshot" VARCHAR(200) NOT NULL,
    "subtotal" DECIMAL(19,2) NOT NULL,
    "tax_amount" DECIMAL(19,2) NOT NULL,
    "total_amount" DECIMAL(19,2) NOT NULL,
    "status" "payment_status" NOT NULL DEFAULT 'Draft',
    "original_statement_id" UUID,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "issued_at" TIMESTAMPTZ(6),
    "is_locked" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "payment_statement_pkey" PRIMARY KEY ("statement_id")
);

-- CreateTable
CREATE TABLE "payment_statement_line" (
    "line_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "statement_id" UUID NOT NULL,
    "price_list_line_id" UUID NOT NULL,
    "volume_line_id" UUID NOT NULL,
    "quantity" DECIMAL(19,4) NOT NULL,
    "unit_price" DECIMAL(19,2) NOT NULL,
    "amount" DECIMAL(19,2) NOT NULL,
    "is_mandatory" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "payment_statement_line_pkey" PRIMARY KEY ("line_id")
);

-- CreateTable
CREATE TABLE "reconciliation" (
    "reconciliation_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "statement_id" UUID NOT NULL,
    "volume_confirmed_by" UUID,
    "volume_confirmed_at" TIMESTAMPTZ(6),
    "discrepancy_note" TEXT,
    "sent_to_customer_at" TIMESTAMPTZ(6),
    "customer_result" "customer_result",
    "customer_feedback" TEXT,
    "reconciled_by" UUID,
    "completed_at" TIMESTAMPTZ(6),
    "price_confirmed_at" TIMESTAMPTZ(6),
    "price_mismatch_note" TEXT,

    CONSTRAINT "reconciliation_pkey" PRIMARY KEY ("reconciliation_id")
);

-- CreateTable
CREATE TABLE "change_request" (
    "request_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "request_type" "change_request_type" NOT NULL,
    "record_type" "document_record_type" NOT NULL,
    "contract_id" UUID,
    "statement_id" UUID,
    "reason" TEXT NOT NULL,
    "status" "change_request_status" NOT NULL DEFAULT 'Pending',
    "requested_by" UUID NOT NULL,
    "requested_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approved_by" UUID,
    "approver_comment" TEXT,
    "decided_at" TIMESTAMPTZ(6),

    CONSTRAINT "change_request_pkey" PRIMARY KEY ("request_id")
);

-- CreateTable
CREATE TABLE "approval_round" (
    "round_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "record_type" "document_record_type" NOT NULL,
    "contract_id" UUID,
    "statement_id" UUID,
    "record_version" INTEGER NOT NULL,
    "round_no" INTEGER NOT NULL,
    "submitted_by" UUID NOT NULL,
    "submitted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "result" "approval_result" NOT NULL DEFAULT 'Running',
    "ended_at" TIMESTAMPTZ(6),
    "record_snapshot" JSONB NOT NULL,

    CONSTRAINT "approval_round_pkey" PRIMARY KEY ("round_id")
);

-- CreateTable
CREATE TABLE "approval_step" (
    "step_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "round_id" UUID NOT NULL,
    "step_name" VARCHAR(200) NOT NULL,
    "step_order" INTEGER NOT NULL,
    "assignee_id" UUID NOT NULL,
    "assigned_at" TIMESTAMPTZ(6),
    "accepted_at" TIMESTAMPTZ(6),
    "step_status" "approval_step_status" NOT NULL DEFAULT 'NotStarted',
    "decision" "approval_decision",
    "comment" TEXT,
    "legal_conclusion" TEXT,
    "decided_by" UUID,
    "decided_at" TIMESTAMPTZ(6),

    CONSTRAINT "approval_step_pkey" PRIMARY KEY ("step_id")
);

-- CreateTable
CREATE TABLE "signing_session" (
    "signing_session_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "record_type" "document_record_type" NOT NULL,
    "contract_id" UUID,
    "statement_id" UUID,
    "provider_session_id" VARCHAR(200) NOT NULL,
    "status" "signing_status" NOT NULL DEFAULT 'Signing',
    "reason" TEXT,
    "company_signer_id" UUID NOT NULL,
    "company_signed_at" TIMESTAMPTZ(6),
    "customer_signer_name" VARCHAR(200) NOT NULL,
    "customer_signer_email" VARCHAR(254) NOT NULL,
    "customer_signed_at" TIMESTAMPTZ(6),
    "signed_file_id" UUID,
    "sent_by" UUID NOT NULL,
    "sent_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "result_at" TIMESTAMPTZ(6),

    CONSTRAINT "signing_session_pkey" PRIMARY KEY ("signing_session_id")
);

-- CreateIndex
CREATE INDEX "department_manager_id_idx" ON "department"("manager_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_account_username_key" ON "user_account"("username");

-- CreateIndex
CREATE UNIQUE INDEX "user_account_company_email_key" ON "user_account"("company_email");

-- CreateIndex
CREATE INDEX "user_account_department_id_idx" ON "user_account"("department_id");

-- CreateIndex
CREATE UNIQUE INDEX "login_session_refresh_token_hash_key" ON "login_session"("refresh_token_hash");

-- CreateIndex
CREATE INDEX "login_session_user_id_idx" ON "login_session"("user_id");

-- CreateIndex
CREATE INDEX "login_session_user_id_is_revoked_expires_at_idx" ON "login_session"("user_id", "is_revoked", "expires_at");

-- CreateIndex
CREATE INDEX "password_otp_user_id_idx" ON "password_otp"("user_id");

-- CreateIndex
CREATE INDEX "password_otp_user_id_sent_at_idx" ON "password_otp"("user_id", "sent_at");

-- CreateIndex
CREATE INDEX "notification_recipient_id_idx" ON "notification"("recipient_id");

-- CreateIndex
CREATE INDEX "notification_recipient_id_is_read_created_at_idx" ON "notification"("recipient_id", "is_read", "created_at");

-- CreateIndex
CREATE INDEX "notification_send_status_created_at_idx" ON "notification"("send_status", "created_at");

-- CreateIndex
CREATE INDEX "audit_log_actor_id_idx" ON "audit_log"("actor_id");

-- CreateIndex
CREATE INDEX "audit_log_entity_type_entity_id_acted_at_idx" ON "audit_log"("entity_type", "entity_id", "acted_at");

-- CreateIndex
CREATE INDEX "attachment_contract_id_idx" ON "attachment"("contract_id");

-- CreateIndex
CREATE INDEX "attachment_statement_id_idx" ON "attachment"("statement_id");

-- CreateIndex
CREATE INDEX "attachment_uploaded_by_idx" ON "attachment"("uploaded_by");

-- CreateIndex
CREATE UNIQUE INDEX "customer_tax_code_key" ON "customer"("tax_code");

-- CreateIndex
CREATE INDEX "customer_account_manager_id_idx" ON "customer"("account_manager_id");

-- CreateIndex
CREATE INDEX "customer_status_decision_customer_id_idx" ON "customer_status_decision"("customer_id");

-- CreateIndex
CREATE INDEX "customer_status_decision_confirmed_by_idx" ON "customer_status_decision"("confirmed_by");

-- CreateIndex
CREATE UNIQUE INDEX "area_area_code_key" ON "area"("area_code");

-- CreateIndex
CREATE INDEX "area_parent_area_id_idx" ON "area"("parent_area_id");

-- CreateIndex
CREATE INDEX "area_service_area_id_idx" ON "area_service"("area_id");

-- CreateIndex
CREATE INDEX "area_service_service_id_idx" ON "area_service"("service_id");

-- CreateIndex
CREATE INDEX "area_assignment_area_id_idx" ON "area_assignment"("area_id");

-- CreateIndex
CREATE INDEX "area_assignment_user_id_idx" ON "area_assignment"("user_id");

-- CreateIndex
CREATE INDEX "contract_parent_contract_id_idx" ON "contract"("parent_contract_id");

-- CreateIndex
CREATE INDEX "contract_customer_id_idx" ON "contract"("customer_id");

-- CreateIndex
CREATE INDEX "contract_owner_id_idx" ON "contract"("owner_id");

-- CreateIndex
CREATE INDEX "contract_status_owner_id_idx" ON "contract"("status", "owner_id");

-- CreateIndex
CREATE INDEX "contract_item_contract_id_idx" ON "contract_item"("contract_id");

-- CreateIndex
CREATE INDEX "contract_item_service_id_idx" ON "contract_item"("service_id");

-- CreateIndex
CREATE INDEX "contract_item_area_id_idx" ON "contract_item"("area_id");

-- CreateIndex
CREATE UNIQUE INDEX "contract_item_contract_id_service_id_area_id_key" ON "contract_item"("contract_id", "service_id", "area_id");

-- CreateIndex
CREATE INDEX "price_list_contract_id_idx" ON "price_list"("contract_id");

-- CreateIndex
CREATE INDEX "price_list_created_by_idx" ON "price_list"("created_by");

-- CreateIndex
CREATE UNIQUE INDEX "price_list_contract_id_version_key" ON "price_list"("contract_id", "version");

-- CreateIndex
CREATE INDEX "price_list_line_price_list_id_idx" ON "price_list_line"("price_list_id");

-- CreateIndex
CREATE INDEX "price_list_line_service_id_idx" ON "price_list_line"("service_id");

-- CreateIndex
CREATE INDEX "price_list_line_area_id_idx" ON "price_list_line"("area_id");

-- CreateIndex
CREATE UNIQUE INDEX "price_list_line_price_list_id_service_id_area_id_key" ON "price_list_line"("price_list_id", "service_id", "area_id");

-- CreateIndex
CREATE INDEX "volume_period_contract_id_idx" ON "volume_period"("contract_id");

-- CreateIndex
CREATE INDEX "volume_period_locked_by_idx" ON "volume_period"("locked_by");

-- CreateIndex
CREATE UNIQUE INDEX "volume_period_contract_id_billing_period_key" ON "volume_period"("contract_id", "billing_period");

-- CreateIndex
CREATE INDEX "volume_line_volume_period_id_idx" ON "volume_line"("volume_period_id");

-- CreateIndex
CREATE INDEX "volume_line_service_id_idx" ON "volume_line"("service_id");

-- CreateIndex
CREATE INDEX "volume_line_area_id_idx" ON "volume_line"("area_id");

-- CreateIndex
CREATE INDEX "payment_statement_contract_id_idx" ON "payment_statement"("contract_id");

-- CreateIndex
CREATE INDEX "payment_statement_price_list_id_idx" ON "payment_statement"("price_list_id");

-- CreateIndex
CREATE INDEX "payment_statement_volume_period_id_idx" ON "payment_statement"("volume_period_id");

-- CreateIndex
CREATE INDEX "payment_statement_original_statement_id_idx" ON "payment_statement"("original_statement_id");

-- CreateIndex
CREATE INDEX "payment_statement_created_by_idx" ON "payment_statement"("created_by");

-- CreateIndex
CREATE INDEX "payment_statement_line_statement_id_idx" ON "payment_statement_line"("statement_id");

-- CreateIndex
CREATE INDEX "payment_statement_line_price_list_line_id_idx" ON "payment_statement_line"("price_list_line_id");

-- CreateIndex
CREATE INDEX "payment_statement_line_volume_line_id_idx" ON "payment_statement_line"("volume_line_id");

-- CreateIndex
CREATE UNIQUE INDEX "reconciliation_statement_id_key" ON "reconciliation"("statement_id");

-- CreateIndex
CREATE INDEX "reconciliation_volume_confirmed_by_idx" ON "reconciliation"("volume_confirmed_by");

-- CreateIndex
CREATE INDEX "reconciliation_reconciled_by_idx" ON "reconciliation"("reconciled_by");

-- CreateIndex
CREATE INDEX "change_request_contract_id_idx" ON "change_request"("contract_id");

-- CreateIndex
CREATE INDEX "change_request_statement_id_idx" ON "change_request"("statement_id");

-- CreateIndex
CREATE INDEX "change_request_requested_by_idx" ON "change_request"("requested_by");

-- CreateIndex
CREATE INDEX "change_request_approved_by_idx" ON "change_request"("approved_by");

-- CreateIndex
CREATE INDEX "approval_round_contract_id_idx" ON "approval_round"("contract_id");

-- CreateIndex
CREATE INDEX "approval_round_statement_id_idx" ON "approval_round"("statement_id");

-- CreateIndex
CREATE INDEX "approval_round_submitted_by_idx" ON "approval_round"("submitted_by");

-- CreateIndex
CREATE UNIQUE INDEX "approval_round_contract_id_round_no_key" ON "approval_round"("contract_id", "round_no");

-- CreateIndex
CREATE UNIQUE INDEX "approval_round_statement_id_round_no_key" ON "approval_round"("statement_id", "round_no");

-- CreateIndex
CREATE INDEX "approval_step_round_id_idx" ON "approval_step"("round_id");

-- CreateIndex
CREATE INDEX "approval_step_assignee_id_idx" ON "approval_step"("assignee_id");

-- CreateIndex
CREATE INDEX "approval_step_decided_by_idx" ON "approval_step"("decided_by");

-- CreateIndex
CREATE UNIQUE INDEX "approval_step_round_id_step_order_key" ON "approval_step"("round_id", "step_order");

-- CreateIndex
CREATE UNIQUE INDEX "signing_session_provider_session_id_key" ON "signing_session"("provider_session_id");

-- CreateIndex
CREATE INDEX "signing_session_contract_id_idx" ON "signing_session"("contract_id");

-- CreateIndex
CREATE INDEX "signing_session_statement_id_idx" ON "signing_session"("statement_id");

-- CreateIndex
CREATE INDEX "signing_session_company_signer_id_idx" ON "signing_session"("company_signer_id");

-- CreateIndex
CREATE INDEX "signing_session_signed_file_id_idx" ON "signing_session"("signed_file_id");

-- CreateIndex
CREATE INDEX "signing_session_sent_by_idx" ON "signing_session"("sent_by");

-- AddForeignKey
ALTER TABLE "department" ADD CONSTRAINT "department_manager_id_fkey" FOREIGN KEY ("manager_id") REFERENCES "user_account"("user_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "user_account" ADD CONSTRAINT "user_account_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "department"("department_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "login_session" ADD CONSTRAINT "login_session_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user_account"("user_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "password_otp" ADD CONSTRAINT "password_otp_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user_account"("user_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "notification" ADD CONSTRAINT "notification_recipient_id_fkey" FOREIGN KEY ("recipient_id") REFERENCES "user_account"("user_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "user_account"("user_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "attachment" ADD CONSTRAINT "attachment_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "contract"("contract_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "attachment" ADD CONSTRAINT "attachment_statement_id_fkey" FOREIGN KEY ("statement_id") REFERENCES "payment_statement"("statement_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "attachment" ADD CONSTRAINT "attachment_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "user_account"("user_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "customer" ADD CONSTRAINT "customer_account_manager_id_fkey" FOREIGN KEY ("account_manager_id") REFERENCES "user_account"("user_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "customer_status_decision" ADD CONSTRAINT "customer_status_decision_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customer"("customer_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "customer_status_decision" ADD CONSTRAINT "customer_status_decision_confirmed_by_fkey" FOREIGN KEY ("confirmed_by") REFERENCES "user_account"("user_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "area" ADD CONSTRAINT "area_parent_area_id_fkey" FOREIGN KEY ("parent_area_id") REFERENCES "area"("area_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "area_service" ADD CONSTRAINT "area_service_area_id_fkey" FOREIGN KEY ("area_id") REFERENCES "area"("area_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "area_service" ADD CONSTRAINT "area_service_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "service"("service_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "area_assignment" ADD CONSTRAINT "area_assignment_area_id_fkey" FOREIGN KEY ("area_id") REFERENCES "area"("area_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "area_assignment" ADD CONSTRAINT "area_assignment_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user_account"("user_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "contract" ADD CONSTRAINT "contract_parent_contract_id_fkey" FOREIGN KEY ("parent_contract_id") REFERENCES "contract"("contract_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "contract" ADD CONSTRAINT "contract_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customer"("customer_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "contract" ADD CONSTRAINT "contract_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "user_account"("user_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "contract_item" ADD CONSTRAINT "contract_item_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "contract"("contract_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "contract_item" ADD CONSTRAINT "contract_item_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "service"("service_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "contract_item" ADD CONSTRAINT "contract_item_area_id_fkey" FOREIGN KEY ("area_id") REFERENCES "area"("area_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "price_list" ADD CONSTRAINT "price_list_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "contract"("contract_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "price_list" ADD CONSTRAINT "price_list_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "user_account"("user_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "price_list_line" ADD CONSTRAINT "price_list_line_price_list_id_fkey" FOREIGN KEY ("price_list_id") REFERENCES "price_list"("price_list_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "price_list_line" ADD CONSTRAINT "price_list_line_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "service"("service_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "price_list_line" ADD CONSTRAINT "price_list_line_area_id_fkey" FOREIGN KEY ("area_id") REFERENCES "area"("area_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "volume_period" ADD CONSTRAINT "volume_period_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "contract"("contract_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "volume_period" ADD CONSTRAINT "volume_period_locked_by_fkey" FOREIGN KEY ("locked_by") REFERENCES "user_account"("user_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "volume_line" ADD CONSTRAINT "volume_line_volume_period_id_fkey" FOREIGN KEY ("volume_period_id") REFERENCES "volume_period"("volume_period_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "volume_line" ADD CONSTRAINT "volume_line_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "service"("service_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "volume_line" ADD CONSTRAINT "volume_line_area_id_fkey" FOREIGN KEY ("area_id") REFERENCES "area"("area_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "payment_statement" ADD CONSTRAINT "payment_statement_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "contract"("contract_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "payment_statement" ADD CONSTRAINT "payment_statement_price_list_id_fkey" FOREIGN KEY ("price_list_id") REFERENCES "price_list"("price_list_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "payment_statement" ADD CONSTRAINT "payment_statement_volume_period_id_fkey" FOREIGN KEY ("volume_period_id") REFERENCES "volume_period"("volume_period_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "payment_statement" ADD CONSTRAINT "payment_statement_original_statement_id_fkey" FOREIGN KEY ("original_statement_id") REFERENCES "payment_statement"("statement_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "payment_statement" ADD CONSTRAINT "payment_statement_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "user_account"("user_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "payment_statement_line" ADD CONSTRAINT "payment_statement_line_statement_id_fkey" FOREIGN KEY ("statement_id") REFERENCES "payment_statement"("statement_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "payment_statement_line" ADD CONSTRAINT "payment_statement_line_price_list_line_id_fkey" FOREIGN KEY ("price_list_line_id") REFERENCES "price_list_line"("line_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "payment_statement_line" ADD CONSTRAINT "payment_statement_line_volume_line_id_fkey" FOREIGN KEY ("volume_line_id") REFERENCES "volume_line"("volume_line_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "reconciliation" ADD CONSTRAINT "reconciliation_statement_id_fkey" FOREIGN KEY ("statement_id") REFERENCES "payment_statement"("statement_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "reconciliation" ADD CONSTRAINT "reconciliation_volume_confirmed_by_fkey" FOREIGN KEY ("volume_confirmed_by") REFERENCES "user_account"("user_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "reconciliation" ADD CONSTRAINT "reconciliation_reconciled_by_fkey" FOREIGN KEY ("reconciled_by") REFERENCES "user_account"("user_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "change_request" ADD CONSTRAINT "change_request_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "contract"("contract_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "change_request" ADD CONSTRAINT "change_request_statement_id_fkey" FOREIGN KEY ("statement_id") REFERENCES "payment_statement"("statement_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "change_request" ADD CONSTRAINT "change_request_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "user_account"("user_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "change_request" ADD CONSTRAINT "change_request_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "user_account"("user_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "approval_round" ADD CONSTRAINT "approval_round_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "contract"("contract_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "approval_round" ADD CONSTRAINT "approval_round_statement_id_fkey" FOREIGN KEY ("statement_id") REFERENCES "payment_statement"("statement_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "approval_round" ADD CONSTRAINT "approval_round_submitted_by_fkey" FOREIGN KEY ("submitted_by") REFERENCES "user_account"("user_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "approval_step" ADD CONSTRAINT "approval_step_round_id_fkey" FOREIGN KEY ("round_id") REFERENCES "approval_round"("round_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "approval_step" ADD CONSTRAINT "approval_step_assignee_id_fkey" FOREIGN KEY ("assignee_id") REFERENCES "user_account"("user_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "approval_step" ADD CONSTRAINT "approval_step_decided_by_fkey" FOREIGN KEY ("decided_by") REFERENCES "user_account"("user_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "signing_session" ADD CONSTRAINT "signing_session_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "contract"("contract_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "signing_session" ADD CONSTRAINT "signing_session_statement_id_fkey" FOREIGN KEY ("statement_id") REFERENCES "payment_statement"("statement_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "signing_session" ADD CONSTRAINT "signing_session_company_signer_id_fkey" FOREIGN KEY ("company_signer_id") REFERENCES "user_account"("user_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "signing_session" ADD CONSTRAINT "signing_session_signed_file_id_fkey" FOREIGN KEY ("signed_file_id") REFERENCES "attachment"("attachment_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "signing_session" ADD CONSTRAINT "signing_session_sent_by_fkey" FOREIGN KEY ("sent_by") REFERENCES "user_account"("user_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

COMMIT;
