-- CreateTable
CREATE TABLE "business_partners" (
    "id" UUID NOT NULL,
    "legal_name" TEXT NOT NULL,
    "trade_name" TEXT NOT NULL,
    "nit" TEXT NOT NULL,
    "sector" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "corporate_email" TEXT NOT NULL,
    "website" TEXT,
    "legal_representative" TEXT,
    "commercial_contact_id" UUID,
    "agreement_type" TEXT NOT NULL,
    "benefits_offered" JSONB NOT NULL,
    "discount_conditions" TEXT,
    "geographic_coverage" TEXT,
    "valid_from" TIMESTAMPTZ(3),
    "valid_until" TIMESTAMPTZ(3),
    "logo_path" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PROSPECT',
    "approval_status" TEXT,
    "publication_status" TEXT NOT NULL DEFAULT 'UNPUBLISHED',
    "internal_notes" TEXT,
    "legal_validation_confirmed" BOOLEAN NOT NULL DEFAULT false,
    "commercial_validation_confirmed" BOOLEAN NOT NULL DEFAULT false,
    "benefit_confirmed" BOOLEAN NOT NULL DEFAULT false,
    "agreement_validity_confirmed" BOOLEAN NOT NULL DEFAULT false,
    "logo_authorization_confirmed" BOOLEAN NOT NULL DEFAULT false,
    "contact_confirmed" BOOLEAN NOT NULL DEFAULT false,
    "coverage_confirmed" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "business_partners_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "business_partners_nit_key" ON "business_partners"("nit");

-- CreateIndex
CREATE INDEX "business_partners_publication_status_idx" ON "business_partners"("publication_status");

-- AddForeignKey
ALTER TABLE "business_partners" ADD CONSTRAINT "business_partners_commercial_contact_id_fkey" FOREIGN KEY ("commercial_contact_id") REFERENCES "commercial_contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
