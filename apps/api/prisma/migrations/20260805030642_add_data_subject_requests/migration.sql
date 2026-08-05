-- CreateEnum
CREATE TYPE "data_subject_request_type" AS ENUM ('ACCESS', 'CONSULTATION', 'UPDATE', 'CORRECTION', 'DELETION', 'REVOCATION', 'PROOF_OF_AUTHORIZATION', 'DATA_USE_INFORMATION', 'COMPLAINT', 'IDENTITY_VERIFICATION', 'INCIDENT_REPORT');

-- CreateEnum
CREATE TYPE "data_subject_request_status" AS ENUM ('RECEIVED', 'IDENTITY_VERIFICATION', 'IN_REVIEW', 'INFORMATION_REQUIRED', 'RESOLVED', 'REJECTED_WITH_REASON', 'CLOSED');

-- AlterEnum
ALTER TYPE "audit_source" ADD VALUE 'REQUEST_CREATE';

-- AlterTable
ALTER TABLE "audit_logs" ADD COLUMN     "data_subject_request_id" UUID;

-- CreateTable
CREATE TABLE "data_subject_requests" (
    "id" UUID NOT NULL,
    "public_reference" TEXT NOT NULL,
    "type" "data_subject_request_type" NOT NULL,
    "requester_name" TEXT NOT NULL,
    "requester_email" TEXT NOT NULL,
    "requester_document" TEXT NOT NULL,
    "identity_verification_status" TEXT,
    "description" TEXT NOT NULL,
    "assigned_user_id" UUID,
    "due_date" TIMESTAMPTZ(3),
    "status" "data_subject_request_status" NOT NULL DEFAULT 'RECEIVED',
    "resolution" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "data_subject_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "data_subject_requests_public_reference_key" ON "data_subject_requests"("public_reference");

-- CreateIndex
CREATE INDEX "data_subject_requests_status_created_at_idx" ON "data_subject_requests"("status", "created_at");

-- CreateIndex
CREATE INDEX "data_subject_requests_assigned_user_id_idx" ON "data_subject_requests"("assigned_user_id");

-- CreateIndex
CREATE INDEX "audit_logs_data_subject_request_id_created_at_idx" ON "audit_logs"("data_subject_request_id", "created_at");

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_data_subject_request_id_fkey" FOREIGN KEY ("data_subject_request_id") REFERENCES "data_subject_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "data_subject_requests" ADD CONSTRAINT "data_subject_requests_assigned_user_id_fkey" FOREIGN KEY ("assigned_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- US-048: extend the US-043 exactly-one-entity CHECK on audit_logs to
-- cover the 3rd domain. Every pre-existing row already satisfies this
-- (data_subject_request_id always null until this migration), so this
-- is a safe, non-destructive replacement.
ALTER TABLE "audit_logs" DROP CONSTRAINT "audit_logs_exactly_one_entity_check";

ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_exactly_one_entity_check"
  CHECK (
    (CASE WHEN "payment_order_id" IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN "legal_document_version_id" IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN "data_subject_request_id" IS NOT NULL THEN 1 ELSE 0 END) = 1
  );
