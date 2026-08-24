-- A parent-row lock serializes publication in the service; this partial
-- unique index is the database-level last line of defence.
CREATE UNIQUE INDEX "plan_versions_one_published_per_plan_idx"
  ON "plan_versions"("plan_id") WHERE "status" = 'PUBLISHED';
