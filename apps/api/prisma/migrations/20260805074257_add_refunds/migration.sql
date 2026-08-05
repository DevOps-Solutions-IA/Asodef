-- CreateEnum
CREATE TYPE "refund_status" AS ENUM ('PENDING_APPROVAL', 'APPROVED', 'FAILED');

-- AlterTable
ALTER TABLE "audit_logs" ADD COLUMN     "refund_id" UUID;

-- CreateTable
CREATE TABLE "refunds" (
    "id" UUID NOT NULL,
    "payment_order_id" UUID NOT NULL,
    "amount_cents" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "evidence_path" TEXT,
    "status" "refund_status" NOT NULL DEFAULT 'PENDING_APPROVAL',
    "approved_by_user_id" UUID,
    "provider_reference" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refunds_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "refunds_payment_order_id_idx" ON "refunds"("payment_order_id");

-- CreateIndex
CREATE INDEX "audit_logs_refund_id_created_at_idx" ON "audit_logs"("refund_id", "created_at");

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_refund_id_fkey" FOREIGN KEY ("refund_id") REFERENCES "refunds"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_payment_order_id_fkey" FOREIGN KEY ("payment_order_id") REFERENCES "payment_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_approved_by_user_id_fkey" FOREIGN KEY ("approved_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- US-056: extend the audit_logs exactly-one-entity CHECK to a 6th
-- domain. Every pre-existing row already satisfies this (refund_id
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
    (CASE WHEN "refund_id" IS NOT NULL THEN 1 ELSE 0 END) = 1
  );
