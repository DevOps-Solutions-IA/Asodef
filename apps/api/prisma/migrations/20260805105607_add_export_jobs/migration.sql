-- CreateEnum
CREATE TYPE "export_job_status" AS ENUM ('PENDING', 'PROCESSING', 'READY', 'FAILED');

-- CreateTable
CREATE TABLE "export_jobs" (
    "id" UUID NOT NULL,
    "report_key" TEXT NOT NULL,
    "filters" JSONB NOT NULL,
    "status" "export_job_status" NOT NULL DEFAULT 'PENDING',
    "row_count" INTEGER,
    "file_path" TEXT,
    "error_message" TEXT,
    "requested_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(3),

    CONSTRAINT "export_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "export_jobs_requested_by_user_id_created_at_idx" ON "export_jobs"("requested_by_user_id", "created_at");

-- AddForeignKey
ALTER TABLE "export_jobs" ADD CONSTRAINT "export_jobs_requested_by_user_id_fkey" FOREIGN KEY ("requested_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
