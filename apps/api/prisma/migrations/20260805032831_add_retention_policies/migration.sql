-- CreateEnum
CREATE TYPE "retention_record_category" AS ENUM ('LEADS', 'OPPORTUNITIES', 'CONTRACTS', 'PAYMENT_ORDERS', 'APPROVED_TRANSACTIONS', 'FAILED_TRANSACTIONS', 'RECEIPTS', 'PQR_CASES', 'AUDIT_LOGS', 'DOCUMENTS', 'CONSENT_RECORDS');

-- CreateEnum
CREATE TYPE "anonymization_action" AS ENUM ('ANONYMIZED', 'DELETED');

-- CreateTable
CREATE TABLE "retention_policies" (
    "id" UUID NOT NULL,
    "record_category" "retention_record_category" NOT NULL,
    "retention_period_days" INTEGER,
    "legal_hold" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "retention_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "anonymization_logs" (
    "id" UUID NOT NULL,
    "record_category" "retention_record_category" NOT NULL,
    "record_id" UUID NOT NULL,
    "action" "anonymization_action" NOT NULL,
    "reason" TEXT NOT NULL,
    "actor_user_id" UUID,
    "executed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "anonymization_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "retention_policies_record_category_key" ON "retention_policies"("record_category");

-- CreateIndex
CREATE INDEX "anonymization_logs_record_category_record_id_idx" ON "anonymization_logs"("record_category", "record_id");

-- AddForeignKey
ALTER TABLE "anonymization_logs" ADD CONSTRAINT "anonymization_logs_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
