-- CreateEnum
CREATE TYPE "plan_version_status" AS ENUM ('DRAFT', 'UNDER_REVIEW', 'ACTIVE', 'SUSPENDED', 'RETIRED', 'ARCHIVED');

-- CreateTable
CREATE TABLE "plan_versions" (
    "id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "internal_name" TEXT NOT NULL,
    "public_name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "coverage" TEXT,
    "included_services" JSONB,
    "exclusions" JSONB,
    "eligibility" TEXT,
    "beneficiary_rules" TEXT,
    "price_cents" INTEGER NOT NULL,
    "billing_frequency" TEXT NOT NULL,
    "taxes" TEXT,
    "start_date" TIMESTAMPTZ(3),
    "end_date" TIMESTAMPTZ(3),
    "status" "plan_version_status" NOT NULL DEFAULT 'DRAFT',
    "terms" TEXT,
    "cancellation_rules" TEXT,
    "renewal_rules" TEXT,
    "payment_conditions" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plan_versions_pkey" PRIMARY KEY ("id")
);

-- AlterTable: add plans.created_at + current_version_id (nullable for now,
-- backfilled below before the unique constraint/FK are added)
ALTER TABLE "plans" ADD COLUMN "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN "current_version_id" UUID;

-- CreateIndex
CREATE INDEX "plan_versions_plan_id_status_idx" ON "plan_versions"("plan_id", "status");
CREATE UNIQUE INDEX "plan_versions_plan_id_version_key" ON "plan_versions"("plan_id", "version");

-- AddForeignKey
ALTER TABLE "plan_versions" ADD CONSTRAINT "plan_versions_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- US-054 data migration: preserve every existing plan's description/active
-- as a real version-1 PlanVersion row instead of silently discarding it
-- on DROP COLUMN below. The only pre-existing row in any environment
-- this has run against is the local dev/test fixture "Plan Demo"
-- (explicitly labeled "no es un plan comercial real" in its own
-- description) - price_cents=0/billing_frequency 'no_definida' here
-- carry that fixture forward as-is, not invent real commercial terms.
INSERT INTO "plan_versions" (
  "id", "plan_id", "version", "internal_name", "public_name", "description",
  "price_cents", "billing_frequency", "status", "created_at"
)
SELECT
  gen_random_uuid(), "id", 1, "name", "name", "description",
  0, 'no_definida',
  CASE WHEN "active" THEN 'ACTIVE'::"plan_version_status" ELSE 'RETIRED'::"plan_version_status" END,
  CURRENT_TIMESTAMP
FROM "plans";

UPDATE "plans" p
SET "current_version_id" = pv."id"
FROM "plan_versions" pv
WHERE pv."plan_id" = p."id" AND pv."version" = 1;

-- Now safe to drop the superseded columns
ALTER TABLE "plans" DROP COLUMN "active";
ALTER TABLE "plans" DROP COLUMN "description";

-- CreateIndex
CREATE UNIQUE INDEX "plans_current_version_id_key" ON "plans"("current_version_id");

-- AddForeignKey
ALTER TABLE "plans" ADD CONSTRAINT "plans_current_version_id_fkey" FOREIGN KEY ("current_version_id") REFERENCES "plan_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "payment_orders" ADD COLUMN "plan_version_accepted_id" UUID;

-- AddForeignKey
ALTER TABLE "payment_orders" ADD CONSTRAINT "payment_orders_plan_version_accepted_id_fkey" FOREIGN KEY ("plan_version_accepted_id") REFERENCES "plan_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
