-- CreateEnum
CREATE TYPE "notification_type" AS ENUM ('PASSWORD_RESET', 'PASSWORD_CHANGED', 'SECURITY_ALERT');

-- CreateEnum
CREATE TYPE "notification_status" AS ENUM ('QUEUED', 'SENT', 'FAILED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "security_event_type" ADD VALUE 'PASSWORD_RESET_REQUESTED';
ALTER TYPE "security_event_type" ADD VALUE 'PASSWORD_RESET_TOKEN_CREATED';
ALTER TYPE "security_event_type" ADD VALUE 'PASSWORD_RESET_SUCCEEDED';
ALTER TYPE "security_event_type" ADD VALUE 'PASSWORD_RESET_FAILED';
ALTER TYPE "security_event_type" ADD VALUE 'PASSWORD_RESET_TOKEN_EXPIRED';
ALTER TYPE "security_event_type" ADD VALUE 'PASSWORD_RESET_TOKEN_REUSED';
ALTER TYPE "security_event_type" ADD VALUE 'PASSWORD_CHANGED';
ALTER TYPE "security_event_type" ADD VALUE 'PASSWORD_CHANGE_FAILED';
ALTER TYPE "security_event_type" ADD VALUE 'PASSWORD_SESSIONS_REVOKED';
ALTER TYPE "security_event_type" ADD VALUE 'PASSWORD_NOTIFICATION_FAILED';

-- AlterEnum
ALTER TYPE "session_revocation_reason" ADD VALUE 'PASSWORD_CHANGED';

-- DropForeignKey
ALTER TABLE "password_resets" DROP CONSTRAINT "password_resets_user_id_fkey";

-- DropIndex
DROP INDEX "password_resets_user_id_idx";

-- AlterTable
ALTER TABLE "password_resets" ADD COLUMN     "request_id" TEXT,
ADD COLUMN     "request_ip" TEXT,
ADD COLUMN     "superseded_at" TIMESTAMPTZ(3),
ADD COLUMN     "user_agent" TEXT,
ALTER COLUMN "user_id" DROP NOT NULL;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "password_changed_at" TIMESTAMPTZ(3);

-- CreateTable
CREATE TABLE "password_history" (
    "id" UUID NOT NULL,
    "user_id" UUID,
    "password_hash" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_jobs" (
    "id" UUID NOT NULL,
    "type" "notification_type" NOT NULL,
    "status" "notification_status" NOT NULL DEFAULT 'QUEUED',
    "recipient_email" TEXT NOT NULL,
    "user_id" UUID,
    "correlation_id" TEXT NOT NULL,
    "template_version" TEXT NOT NULL,
    "retry_count" INTEGER NOT NULL DEFAULT 0,
    "failure_reason" TEXT,
    "sent_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "notification_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "password_history_user_id_created_at_idx" ON "password_history"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "notification_jobs_user_id_created_at_idx" ON "notification_jobs"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "notification_jobs_status_created_at_idx" ON "notification_jobs"("status", "created_at");

-- CreateIndex
CREATE INDEX "notification_jobs_correlation_id_idx" ON "notification_jobs"("correlation_id");

-- CreateIndex
CREATE INDEX "password_resets_user_id_created_at_idx" ON "password_resets"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "password_resets_expires_at_idx" ON "password_resets"("expires_at");

-- AddForeignKey
ALTER TABLE "password_resets" ADD CONSTRAINT "password_resets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "password_history" ADD CONSTRAINT "password_history_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_jobs" ADD CONSTRAINT "notification_jobs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

