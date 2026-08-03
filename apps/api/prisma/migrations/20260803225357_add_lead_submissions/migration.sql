-- CreateEnum
CREATE TYPE "lead_status" AS ENUM ('PENDING', 'REVIEWED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "lead_notification_status" AS ENUM ('PENDING', 'SENT');

-- CreateTable
CREATE TABLE "lead_submissions" (
    "id" UUID NOT NULL,
    "full_name" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "position" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "sector" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "consent_accepted" BOOLEAN NOT NULL,
    "status" "lead_status" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "lead_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead_notifications" (
    "id" UUID NOT NULL,
    "lead_submission_id" UUID NOT NULL,
    "status" "lead_notification_status" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "lead_notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "lead_submissions_created_at_idx" ON "lead_submissions"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "lead_notifications_lead_submission_id_key" ON "lead_notifications"("lead_submission_id");

-- AddForeignKey
ALTER TABLE "lead_notifications" ADD CONSTRAINT "lead_notifications_lead_submission_id_fkey" FOREIGN KEY ("lead_submission_id") REFERENCES "lead_submissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
