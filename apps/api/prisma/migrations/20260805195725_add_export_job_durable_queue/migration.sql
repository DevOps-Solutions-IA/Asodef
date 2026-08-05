-- US-076: durable Postgres-backed export job queue fields.
-- AlterTable
ALTER TABLE "export_jobs"
  ADD COLUMN     "lease_owner" TEXT,
  ADD COLUMN     "lease_expires_at" TIMESTAMPTZ(3),
  ADD COLUMN     "attempt_count" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN     "max_attempts" INTEGER NOT NULL DEFAULT 3,
  ADD COLUMN     "next_attempt_at" TIMESTAMPTZ(3),
  ADD COLUMN     "failed_at" TIMESTAMPTZ(3);

-- CreateIndex
CREATE INDEX "export_jobs_status_lease_expires_at_idx" ON "export_jobs"("status", "lease_expires_at");
