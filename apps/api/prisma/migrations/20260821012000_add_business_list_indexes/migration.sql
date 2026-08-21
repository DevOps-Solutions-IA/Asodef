-- Stable server-side list order/filter indexes for the bounded Phase 2 reads.
CREATE INDEX "lead_submissions_created_at_id_idx" ON "lead_submissions"("created_at" DESC, "id" ASC);
CREATE INDEX "prospects_created_at_id_idx" ON "prospects"("created_at" DESC, "id" ASC);
CREATE INDEX "prospects_stage_created_at_id_idx" ON "prospects"("stage", "created_at" DESC, "id" ASC);
CREATE INDEX "opportunities_created_at_id_idx" ON "opportunities"("created_at" DESC, "id" ASC);
CREATE INDEX "opportunities_stage_created_at_id_idx" ON "opportunities"("stage", "created_at" DESC, "id" ASC);
CREATE INDEX "companies_created_at_id_idx" ON "companies"("created_at" DESC, "id" ASC);
CREATE INDEX "companies_status_created_at_id_idx" ON "companies"("status", "created_at" DESC, "id" ASC);
CREATE INDEX "business_partners_created_at_id_idx" ON "business_partners"("created_at" DESC, "id" ASC);
CREATE INDEX "business_partners_publication_created_at_id_idx" ON "business_partners"("publication_status", "created_at" DESC, "id" ASC);
