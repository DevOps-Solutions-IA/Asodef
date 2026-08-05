-- CreateEnum
CREATE TYPE "legal_document_version_status" AS ENUM ('DRAFT', 'LEGAL_REVIEW', 'PENDING_APPROVAL', 'APPROVED', 'PUBLISHED', 'REPLACED', 'ARCHIVED');

-- AlterTable
ALTER TABLE "audit_logs" ADD COLUMN     "actor_user_id" UUID,
ADD COLUMN     "legal_document_version_id" UUID,
ALTER COLUMN "payment_order_id" DROP NOT NULL;

-- Hand-added (not Prisma-generated): every AuditLog row must reference
-- exactly one domain entity - never both, never neither. Every
-- pre-existing row already satisfies this (payment_order_id always
-- set, legal_document_version_id always null), so this is safe against
-- current data.
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_exactly_one_entity_check"
  CHECK (
    (CASE WHEN "payment_order_id" IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN "legal_document_version_id" IS NOT NULL THEN 1 ELSE 0 END) = 1
  );

-- CreateTable
CREATE TABLE "legal_documents" (
    "id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "current_version_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "legal_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "legal_document_versions" (
    "id" UUID NOT NULL,
    "legal_document_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "legal_document_version_status" NOT NULL DEFAULT 'DRAFT',
    "draft_content" JSONB NOT NULL,
    "approved_content" JSONB,
    "effective_date" TIMESTAMPTZ(3),
    "expiration_date" TIMESTAMPTZ(3),
    "change_summary" TEXT,
    "approved_by_user_id" UUID,
    "approval_date" TIMESTAMPTZ(3),
    "publication_date" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "legal_document_versions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "legal_documents_slug_key" ON "legal_documents"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "legal_documents_current_version_id_key" ON "legal_documents"("current_version_id");

-- CreateIndex
CREATE INDEX "legal_document_versions_legal_document_id_status_idx" ON "legal_document_versions"("legal_document_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "legal_document_versions_legal_document_id_version_key" ON "legal_document_versions"("legal_document_id", "version");

-- CreateIndex
CREATE INDEX "audit_logs_legal_document_version_id_created_at_idx" ON "audit_logs"("legal_document_version_id", "created_at");

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_legal_document_version_id_fkey" FOREIGN KEY ("legal_document_version_id") REFERENCES "legal_document_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "legal_documents" ADD CONSTRAINT "legal_documents_current_version_id_fkey" FOREIGN KEY ("current_version_id") REFERENCES "legal_document_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "legal_document_versions" ADD CONSTRAINT "legal_document_versions_legal_document_id_fkey" FOREIGN KEY ("legal_document_id") REFERENCES "legal_documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "legal_document_versions" ADD CONSTRAINT "legal_document_versions_approved_by_user_id_fkey" FOREIGN KEY ("approved_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
