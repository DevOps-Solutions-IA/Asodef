-- CreateEnum
CREATE TYPE "contract_status" AS ENUM ('DRAFT', 'UNDER_REVIEW', 'PENDING_ACCEPTANCE', 'ACTIVE', 'EXPIRED', 'CANCELLED', 'ARCHIVED');

-- CreateTable
CREATE TABLE "contracts" (
    "id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "related_company_id" UUID,
    "related_customer_id" UUID,
    "internal_reference" TEXT NOT NULL,
    "current_version_id" UUID,
    "status" "contract_status" NOT NULL DEFAULT 'DRAFT',
    "effective_date" TIMESTAMPTZ(3),
    "expiration_date" TIMESTAMPTZ(3),
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contracts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contract_versions" (
    "id" UUID NOT NULL,
    "contract_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "document_path" TEXT NOT NULL,
    "checksum" TEXT NOT NULL,
    "change_summary" TEXT,
    "created_by_user_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contract_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contract_signers" (
    "id" UUID NOT NULL,
    "contract_version_id" UUID NOT NULL,
    "full_name" TEXT NOT NULL,
    "role" TEXT,
    "email" TEXT NOT NULL,

    CONSTRAINT "contract_signers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contract_acceptances" (
    "id" UUID NOT NULL,
    "contract_version_id" UUID NOT NULL,
    "signer_id" UUID NOT NULL,
    "accepted_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip_address" TEXT,
    "evidence_reference" TEXT,

    CONSTRAINT "contract_acceptances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contract_download_tokens" (
    "id" UUID NOT NULL,
    "contract_version_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "issued_by_user_id" UUID,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contract_download_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "contracts_current_version_id_key" ON "contracts"("current_version_id");

-- CreateIndex
CREATE INDEX "contracts_status_idx" ON "contracts"("status");

-- CreateIndex
CREATE UNIQUE INDEX "contract_versions_contract_id_version_key" ON "contract_versions"("contract_id", "version");

-- CreateIndex
CREATE INDEX "contract_signers_contract_version_id_idx" ON "contract_signers"("contract_version_id");

-- CreateIndex
CREATE UNIQUE INDEX "contract_acceptances_contract_version_id_signer_id_key" ON "contract_acceptances"("contract_version_id", "signer_id");

-- CreateIndex
CREATE UNIQUE INDEX "contract_download_tokens_token_hash_key" ON "contract_download_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "contract_download_tokens_expires_at_idx" ON "contract_download_tokens"("expires_at");

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_related_company_id_fkey" FOREIGN KEY ("related_company_id") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_related_customer_id_fkey" FOREIGN KEY ("related_customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_current_version_id_fkey" FOREIGN KEY ("current_version_id") REFERENCES "contract_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_versions" ADD CONSTRAINT "contract_versions_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "contracts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_versions" ADD CONSTRAINT "contract_versions_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_signers" ADD CONSTRAINT "contract_signers_contract_version_id_fkey" FOREIGN KEY ("contract_version_id") REFERENCES "contract_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_acceptances" ADD CONSTRAINT "contract_acceptances_contract_version_id_fkey" FOREIGN KEY ("contract_version_id") REFERENCES "contract_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_acceptances" ADD CONSTRAINT "contract_acceptances_signer_id_fkey" FOREIGN KEY ("signer_id") REFERENCES "contract_signers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_download_tokens" ADD CONSTRAINT "contract_download_tokens_contract_version_id_fkey" FOREIGN KEY ("contract_version_id") REFERENCES "contract_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_download_tokens" ADD CONSTRAINT "contract_download_tokens_issued_by_user_id_fkey" FOREIGN KEY ("issued_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
