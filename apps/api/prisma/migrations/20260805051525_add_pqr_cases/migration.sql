-- CreateEnum
CREATE TYPE "pqr_case_status" AS ENUM ('RECEIVED', 'ASSIGNED', 'IN_REVIEW', 'INFORMATION_REQUIRED', 'RESOLVED', 'CLOSED', 'REOPENED');

-- AlterTable
ALTER TABLE "audit_logs" ADD COLUMN     "pqr_case_id" UUID;

-- CreateTable
CREATE TABLE "pqr_cases" (
    "id" UUID NOT NULL,
    "case_number" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "applicant_name" TEXT NOT NULL,
    "applicant_contact" TEXT NOT NULL,
    "related_customer_id" UUID,
    "related_payment_order_id" UUID,
    "related_contract_id" UUID,
    "description" TEXT NOT NULL,
    "assigned_team" TEXT,
    "priority" TEXT,
    "due_date" TIMESTAMPTZ(3),
    "status" "pqr_case_status" NOT NULL DEFAULT 'RECEIVED',
    "resolution" TEXT,
    "satisfaction_score" INTEGER,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "pqr_cases_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "pqr_cases_case_number_key" ON "pqr_cases"("case_number");

-- CreateIndex
CREATE INDEX "pqr_cases_status_created_at_idx" ON "pqr_cases"("status", "created_at");

-- CreateIndex
CREATE INDEX "pqr_cases_related_customer_id_idx" ON "pqr_cases"("related_customer_id");

-- CreateIndex
CREATE INDEX "pqr_cases_related_payment_order_id_idx" ON "pqr_cases"("related_payment_order_id");

-- CreateIndex
CREATE INDEX "audit_logs_pqr_case_id_created_at_idx" ON "audit_logs"("pqr_case_id", "created_at");

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_pqr_case_id_fkey" FOREIGN KEY ("pqr_case_id") REFERENCES "pqr_cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pqr_cases" ADD CONSTRAINT "pqr_cases_related_customer_id_fkey" FOREIGN KEY ("related_customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pqr_cases" ADD CONSTRAINT "pqr_cases_related_payment_order_id_fkey" FOREIGN KEY ("related_payment_order_id") REFERENCES "payment_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- US-050: extend the audit_logs exactly-one-entity CHECK to a 4th
-- domain. Every pre-existing row already satisfies this (pqr_case_id
-- always null until this migration), so this is a safe, non-
-- destructive replacement.
ALTER TABLE "audit_logs" DROP CONSTRAINT "audit_logs_exactly_one_entity_check";

ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_exactly_one_entity_check"
  CHECK (
    (CASE WHEN "payment_order_id" IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN "legal_document_version_id" IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN "data_subject_request_id" IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN "pqr_case_id" IS NOT NULL THEN 1 ELSE 0 END) = 1
  );
