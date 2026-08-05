-- AlterTable
ALTER TABLE "audit_logs" ADD COLUMN     "company_id" UUID;

-- CreateIndex
CREATE INDEX "audit_logs_company_id_created_at_idx" ON "audit_logs"("company_id", "created_at");

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- US-074: extend the audit_logs exactly-one-entity CHECK to a 7th
-- domain. Every pre-existing row already satisfies this (company_id
-- always null until this migration), so this is a safe,
-- non-destructive replacement.
ALTER TABLE "audit_logs" DROP CONSTRAINT "audit_logs_exactly_one_entity_check";

ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_exactly_one_entity_check"
  CHECK (
    (CASE WHEN "payment_order_id" IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN "legal_document_version_id" IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN "data_subject_request_id" IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN "pqr_case_id" IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN "opportunity_id" IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN "refund_id" IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN "company_id" IS NOT NULL THEN 1 ELSE 0 END) = 1
  );
