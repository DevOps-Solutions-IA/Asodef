ALTER TABLE "lead_submissions"
  ADD COLUMN "public_reference" TEXT,
  ADD COLUMN "source" TEXT,
  ADD COLUMN "entry_route" TEXT,
  ADD COLUMN "audience" TEXT,
  ADD COLUMN "need" TEXT,
  ADD COLUMN "preferred_contact" TEXT,
  ADD COLUMN "campaign" JSONB,
  ADD COLUMN "funnel_payload" JSONB,
  ADD COLUMN "idempotency_key" TEXT;

CREATE UNIQUE INDEX "lead_submissions_public_reference_key" ON "lead_submissions"("public_reference");
CREATE UNIQUE INDEX "lead_submissions_idempotency_key_key" ON "lead_submissions"("idempotency_key");
CREATE INDEX "lead_submissions_source_audience_need_idx" ON "lead_submissions"("source", "audience", "need");
