-- CreateEnum
CREATE TYPE "communication_kind" AS ENUM ('TRANSACTIONAL', 'MARKETING');

-- CreateEnum
CREATE TYPE "communication_log_status" AS ENUM ('SENT', 'SUPPRESSED', 'FAILED');

-- CreateTable
CREATE TABLE "communication_templates" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "kind" "communication_kind" NOT NULL,
    "subject" TEXT,
    "body" JSONB NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "communication_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "communication_logs" (
    "id" UUID NOT NULL,
    "template_id" UUID NOT NULL,
    "recipient" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "status" "communication_log_status" NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 1,
    "error_category" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sent_at" TIMESTAMPTZ(3),

    CONSTRAINT "communication_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "suppression_list_entries" (
    "id" UUID NOT NULL,
    "channel" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "suppression_list_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "communication_templates_key_key" ON "communication_templates"("key");

-- CreateIndex
CREATE INDEX "communication_logs_recipient_channel_idx" ON "communication_logs"("recipient", "channel");

-- CreateIndex
CREATE INDEX "communication_logs_template_id_created_at_idx" ON "communication_logs"("template_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "suppression_list_entries_channel_recipient_key" ON "suppression_list_entries"("channel", "recipient");

-- AddForeignKey
ALTER TABLE "communication_logs" ADD CONSTRAINT "communication_logs_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "communication_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
