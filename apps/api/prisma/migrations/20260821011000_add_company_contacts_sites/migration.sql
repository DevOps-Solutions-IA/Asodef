ALTER TABLE "commercial_contacts" ALTER COLUMN "prospect_id" DROP NOT NULL;

CREATE TABLE "company_sites" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "phone" TEXT,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "company_sites_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "company_sites_company_id_idx" ON "company_sites"("company_id");
CREATE UNIQUE INDEX "company_sites_one_primary_per_company_idx" ON "company_sites"("company_id") WHERE "is_primary" = true;

ALTER TABLE "company_sites"
  ADD CONSTRAINT "company_sites_company_id_fkey"
  FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
