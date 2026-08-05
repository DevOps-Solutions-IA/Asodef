-- CreateEnum
CREATE TYPE "consent_status" AS ENUM ('GRANTED', 'DENIED', 'REVOKED', 'EXPIRED', 'REPLACED');

-- CreateTable
CREATE TABLE "consent_purposes" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "requires_policy_version" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "consent_purposes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consent_records" (
    "id" UUID NOT NULL,
    "consent_purpose_id" UUID NOT NULL,
    "legal_document_version_id" UUID,
    "user_id" UUID,
    "lead_submission_id" UUID,
    "customer_id" UUID,
    "status" "consent_status" NOT NULL DEFAULT 'GRANTED',
    "ip_address" TEXT,
    "user_agent" TEXT,
    "source" TEXT NOT NULL,
    "acceptance_method" TEXT NOT NULL,
    "revoked_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "consent_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "consent_purposes_key_key" ON "consent_purposes"("key");

-- CreateIndex
CREATE INDEX "consent_records_consent_purpose_id_created_at_idx" ON "consent_records"("consent_purpose_id", "created_at");

-- CreateIndex
CREATE INDEX "consent_records_user_id_created_at_idx" ON "consent_records"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "consent_records_lead_submission_id_created_at_idx" ON "consent_records"("lead_submission_id", "created_at");

-- CreateIndex
CREATE INDEX "consent_records_customer_id_created_at_idx" ON "consent_records"("customer_id", "created_at");

-- AddForeignKey
ALTER TABLE "consent_records" ADD CONSTRAINT "consent_records_consent_purpose_id_fkey" FOREIGN KEY ("consent_purpose_id") REFERENCES "consent_purposes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consent_records" ADD CONSTRAINT "consent_records_legal_document_version_id_fkey" FOREIGN KEY ("legal_document_version_id") REFERENCES "legal_document_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consent_records" ADD CONSTRAINT "consent_records_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consent_records" ADD CONSTRAINT "consent_records_lead_submission_id_fkey" FOREIGN KEY ("lead_submission_id") REFERENCES "lead_submissions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consent_records" ADD CONSTRAINT "consent_records_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Exactly one subject per consent record (US-046, same pattern as
-- audit_logs_exactly_one_entity_check from US-043): a consent record
-- must always be attributable to exactly one of an authenticated user,
-- a public lead submission, or a payment customer - never zero, never
-- more than one.
ALTER TABLE "consent_records" ADD CONSTRAINT "consent_records_exactly_one_subject_check"
  CHECK (
    (CASE WHEN "user_id" IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN "lead_submission_id" IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN "customer_id" IS NOT NULL THEN 1 ELSE 0 END) = 1
  );
