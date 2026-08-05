-- CreateEnum
CREATE TYPE "prospect_type" AS ENUM ('INDIVIDUAL', 'COMPANY');

-- CreateEnum
CREATE TYPE "commercial_pipeline_stage" AS ENUM ('NEW_PROSPECT', 'CONTACTED', 'QUALIFIED', 'COMMERCIAL_MEETING', 'PROPOSAL_PREPARATION', 'PROPOSAL_SUBMITTED', 'NEGOTIATION', 'LEGAL_REVIEW', 'CONTRACT_PENDING', 'ACTIVE_PARTNER', 'INACTIVE', 'LOST_OPPORTUNITY', 'RENEWAL_PENDING', 'CONTRACT_EXPIRED');

-- CreateEnum
CREATE TYPE "commercial_activity_type" AS ENUM ('CALL', 'MEETING', 'EMAIL', 'TASK');

-- AlterTable
ALTER TABLE "audit_logs" ADD COLUMN     "opportunity_id" UUID;

-- AlterTable
ALTER TABLE "lead_submissions" ADD COLUMN     "prospect_id" UUID;

-- CreateTable
CREATE TABLE "prospects" (
    "id" UUID NOT NULL,
    "type" "prospect_type" NOT NULL,
    "full_name_or_legal_name" TEXT NOT NULL,
    "document_or_nit" TEXT NOT NULL,
    "sector" TEXT,
    "city" TEXT,
    "source" TEXT,
    "assigned_user_id" UUID,
    "stage" "commercial_pipeline_stage" NOT NULL DEFAULT 'NEW_PROSPECT',
    "estimated_value_cents" INTEGER,
    "probability" INTEGER,
    "expected_closing_date" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "prospects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commercial_contacts" (
    "id" UUID NOT NULL,
    "prospect_id" UUID NOT NULL,
    "company_id" UUID,
    "full_name" TEXT NOT NULL,
    "role" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "commercial_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "opportunities" (
    "id" UUID NOT NULL,
    "prospect_id" UUID NOT NULL,
    "company_id" UUID,
    "assigned_user_id" UUID,
    "stage" "commercial_pipeline_stage" NOT NULL DEFAULT 'NEW_PROSPECT',
    "estimated_value_cents" INTEGER,
    "proposed_benefit" TEXT,
    "expected_closing_date" TIMESTAMPTZ(3),
    "probability" INTEGER,
    "won_lost_reason" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "opportunities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "opportunity_status_history" (
    "id" UUID NOT NULL,
    "opportunity_id" UUID NOT NULL,
    "from_stage" "commercial_pipeline_stage",
    "to_stage" "commercial_pipeline_stage" NOT NULL,
    "changed_by_user_id" UUID,
    "note" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "opportunity_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commercial_activities" (
    "id" UUID NOT NULL,
    "opportunity_id" UUID NOT NULL,
    "type" "commercial_activity_type" NOT NULL,
    "due_date" TIMESTAMPTZ(3),
    "completed_at" TIMESTAMPTZ(3),
    "assigned_user_id" UUID,
    "note" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "commercial_activities_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "prospects_stage_idx" ON "prospects"("stage");

-- CreateIndex
CREATE INDEX "prospects_assigned_user_id_idx" ON "prospects"("assigned_user_id");

-- CreateIndex
CREATE INDEX "commercial_contacts_prospect_id_idx" ON "commercial_contacts"("prospect_id");

-- CreateIndex
CREATE INDEX "opportunities_stage_idx" ON "opportunities"("stage");

-- CreateIndex
CREATE INDEX "opportunities_prospect_id_idx" ON "opportunities"("prospect_id");

-- CreateIndex
CREATE INDEX "opportunity_status_history_opportunity_id_created_at_idx" ON "opportunity_status_history"("opportunity_id", "created_at");

-- CreateIndex
CREATE INDEX "commercial_activities_opportunity_id_idx" ON "commercial_activities"("opportunity_id");

-- CreateIndex
CREATE INDEX "commercial_activities_assigned_user_id_completed_at_idx" ON "commercial_activities"("assigned_user_id", "completed_at");

-- CreateIndex
CREATE INDEX "audit_logs_opportunity_id_created_at_idx" ON "audit_logs"("opportunity_id", "created_at");

-- AddForeignKey
ALTER TABLE "lead_submissions" ADD CONSTRAINT "lead_submissions_prospect_id_fkey" FOREIGN KEY ("prospect_id") REFERENCES "prospects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_opportunity_id_fkey" FOREIGN KEY ("opportunity_id") REFERENCES "opportunities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prospects" ADD CONSTRAINT "prospects_assigned_user_id_fkey" FOREIGN KEY ("assigned_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commercial_contacts" ADD CONSTRAINT "commercial_contacts_prospect_id_fkey" FOREIGN KEY ("prospect_id") REFERENCES "prospects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commercial_contacts" ADD CONSTRAINT "commercial_contacts_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_prospect_id_fkey" FOREIGN KEY ("prospect_id") REFERENCES "prospects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_assigned_user_id_fkey" FOREIGN KEY ("assigned_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opportunity_status_history" ADD CONSTRAINT "opportunity_status_history_opportunity_id_fkey" FOREIGN KEY ("opportunity_id") REFERENCES "opportunities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opportunity_status_history" ADD CONSTRAINT "opportunity_status_history_changed_by_user_id_fkey" FOREIGN KEY ("changed_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commercial_activities" ADD CONSTRAINT "commercial_activities_opportunity_id_fkey" FOREIGN KEY ("opportunity_id") REFERENCES "opportunities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commercial_activities" ADD CONSTRAINT "commercial_activities_assigned_user_id_fkey" FOREIGN KEY ("assigned_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- US-051: extend the audit_logs exactly-one-entity CHECK to a 5th
-- domain. Every pre-existing row already satisfies this
-- (opportunity_id always null until this migration), so this is a
-- safe, non-destructive replacement.
ALTER TABLE "audit_logs" DROP CONSTRAINT "audit_logs_exactly_one_entity_check";

ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_exactly_one_entity_check"
  CHECK (
    (CASE WHEN "payment_order_id" IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN "legal_document_version_id" IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN "data_subject_request_id" IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN "pqr_case_id" IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN "opportunity_id" IS NOT NULL THEN 1 ELSE 0 END) = 1
  );
