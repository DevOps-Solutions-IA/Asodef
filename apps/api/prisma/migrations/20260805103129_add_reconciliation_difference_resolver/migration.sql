-- AlterTable
ALTER TABLE "reconciliation_differences" ADD COLUMN     "resolved_at" TIMESTAMPTZ(3),
ADD COLUMN     "resolved_by_user_id" UUID;

-- AddForeignKey
ALTER TABLE "reconciliation_differences" ADD CONSTRAINT "reconciliation_differences_resolved_by_user_id_fkey" FOREIGN KEY ("resolved_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
