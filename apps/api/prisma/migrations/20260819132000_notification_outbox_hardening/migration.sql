-- Extend the existing notification outbox without rewriting historical rows.
-- Payloads are encrypted by the application before persistence. Historical
-- QUEUED rows have NULL payloads and are failed closed by the worker.
ALTER TYPE "notification_status" ADD VALUE IF NOT EXISTS 'PROCESSING';
ALTER TYPE "notification_status" ADD VALUE IF NOT EXISTS 'RETRY_PENDING';
ALTER TYPE "notification_status" ADD VALUE IF NOT EXISTS 'DEAD_LETTER';

ALTER TABLE "notification_jobs"
  ADD COLUMN "max_attempts" INTEGER NOT NULL DEFAULT 5,
  ADD COLUMN "payload_encrypted" TEXT,
  ADD COLUMN "next_attempt_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "last_attempt_at" TIMESTAMPTZ(3),
  ADD COLUMN "locked_at" TIMESTAMPTZ(3),
  ADD COLUMN "lock_expires_at" TIMESTAMPTZ(3),
  ADD COLUMN "locked_by" TEXT,
  ADD COLUMN "provider_message_id" TEXT;

CREATE INDEX "notification_jobs_status_next_attempt_at_idx"
  ON "notification_jobs"("status", "next_attempt_at");

CREATE INDEX "notification_jobs_status_lock_expires_at_idx"
  ON "notification_jobs"("status", "lock_expires_at");
