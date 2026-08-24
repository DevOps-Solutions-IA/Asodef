-- Canonical lifecycle values are additive. Legacy values remain available so
-- no historical row is reinterpreted or rewritten by this migration.
ALTER TYPE "plan_version_status" ADD VALUE IF NOT EXISTS 'REVIEW';
ALTER TYPE "plan_version_status" ADD VALUE IF NOT EXISTS 'PUBLISHED';

ALTER TABLE "plans" ADD COLUMN "code" TEXT;

ALTER TABLE "plan_versions"
  ADD COLUMN "benefits" JSONB,
  ADD COLUMN "currency" VARCHAR(3),
  ADD COLUMN "commercial_text" TEXT,
  ADD COLUMN "public_visibility" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "koral_visibility" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "crm_visibility" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "contract_visibility" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "recommended" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "display_order" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "reviewed_at" TIMESTAMPTZ(3),
  ADD COLUMN "published_at" TIMESTAMPTZ(3),
  ADD COLUMN "retired_at" TIMESTAMPTZ(3);

ALTER TABLE "contract_versions" ADD COLUMN "plan_version_id" UUID;
ALTER TABLE "audit_logs" ADD COLUMN "plan_version_id" UUID;

CREATE UNIQUE INDEX "plans_code_key" ON "plans"("code");
CREATE INDEX "contract_versions_plan_version_id_idx" ON "contract_versions"("plan_version_id");
CREATE INDEX "audit_logs_plan_version_id_created_at_idx" ON "audit_logs"("plan_version_id", "created_at");

ALTER TABLE "contract_versions" ADD CONSTRAINT "contract_versions_plan_version_id_fkey"
  FOREIGN KEY ("plan_version_id") REFERENCES "plan_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_plan_version_id_fkey"
  FOREIGN KEY ("plan_version_id") REFERENCES "plan_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Preserve the database-enforced one-domain-per-audit-row invariant.
ALTER TABLE "audit_logs" DROP CONSTRAINT "audit_logs_exactly_one_entity_check";
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_exactly_one_entity_check"
  CHECK (
    (CASE WHEN "payment_order_id" IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN "legal_document_version_id" IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN "data_subject_request_id" IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN "pqr_case_id" IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN "opportunity_id" IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN "refund_id" IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN "company_id" IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN "plan_version_id" IS NOT NULL THEN 1 ELSE 0 END) = 1
  );
