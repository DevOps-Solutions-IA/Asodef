-- CreateEnum
CREATE TYPE "reconciliation_resolution_status" AS ENUM ('OPEN', 'RESOLVED');

-- CreateEnum
CREATE TYPE "reconciliation_difference_kind" AS ENUM ('PROVIDER_APPROVED_INTERNALLY_PENDING', 'INTERNAL_APPROVED_NO_PROVIDER_CONFIRMATION', 'DUPLICATE_EVENT', 'AMOUNT_MISMATCH', 'REFERENCE_MISMATCH', 'UNPROCESSED_NOTIFICATION', 'REFUND_INCONSISTENCY');

-- CreateTable
CREATE TABLE "reconciliations" (
    "id" UUID NOT NULL,
    "run_date" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "range_start" TIMESTAMPTZ(3) NOT NULL,
    "range_end" TIMESTAMPTZ(3) NOT NULL,
    "responsible_user_id" UUID NOT NULL,
    "differences_found" INTEGER NOT NULL DEFAULT 0,
    "resolution_status" "reconciliation_resolution_status" NOT NULL DEFAULT 'OPEN',
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reconciliations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reconciliation_differences" (
    "id" UUID NOT NULL,
    "reconciliation_id" UUID NOT NULL,
    "payment_order_id" UUID,
    "kind" "reconciliation_difference_kind" NOT NULL,
    "details" JSONB NOT NULL,
    "resolution_status" "reconciliation_resolution_status" NOT NULL DEFAULT 'OPEN',
    "resolution_notes" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reconciliation_differences_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "reconciliations_range_start_range_end_idx" ON "reconciliations"("range_start", "range_end");

-- CreateIndex
CREATE INDEX "reconciliation_differences_reconciliation_id_idx" ON "reconciliation_differences"("reconciliation_id");

-- CreateIndex
CREATE UNIQUE INDEX "reconciliation_differences_payment_order_id_kind_key" ON "reconciliation_differences"("payment_order_id", "kind");

-- AddForeignKey
ALTER TABLE "reconciliations" ADD CONSTRAINT "reconciliations_responsible_user_id_fkey" FOREIGN KEY ("responsible_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reconciliation_differences" ADD CONSTRAINT "reconciliation_differences_reconciliation_id_fkey" FOREIGN KEY ("reconciliation_id") REFERENCES "reconciliations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reconciliation_differences" ADD CONSTRAINT "reconciliation_differences_payment_order_id_fkey" FOREIGN KEY ("payment_order_id") REFERENCES "payment_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
