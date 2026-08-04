-- CreateEnum
CREATE TYPE "audit_source" AS ENUM ('ORDER_CREATE', 'BOLD_CREATE', 'POLL', 'WEBHOOK', 'MANUAL');

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "payment_order_id" UUID NOT NULL,
    "action" TEXT NOT NULL,
    "previous_status" TEXT,
    "new_status" TEXT,
    "applied" BOOLEAN NOT NULL DEFAULT true,
    "source" "audit_source" NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "audit_logs_payment_order_id_created_at_idx" ON "audit_logs"("payment_order_id", "created_at");

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_payment_order_id_fkey" FOREIGN KEY ("payment_order_id") REFERENCES "payment_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
