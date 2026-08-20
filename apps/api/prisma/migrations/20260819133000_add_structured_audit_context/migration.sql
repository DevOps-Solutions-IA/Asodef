-- Additive audit context only. Existing rows and domain-specific foreign
-- keys remain untouched; no generic entity type/id relationship is claimed.
CREATE TYPE "audit_event_result" AS ENUM (
  'SUCCESS',
  'FAILURE',
  'DENIED',
  'NO_OP',
  'UNKNOWN'
);

ALTER TABLE "security_events"
  ADD COLUMN "actor_user_id" UUID,
  ADD COLUMN "subject_user_id" UUID,
  ADD COLUMN "result" "audit_event_result",
  ADD COLUMN "reason" TEXT,
  ADD COLUMN "correlation_id" TEXT;

ALTER TABLE "audit_logs"
  ADD COLUMN "result" "audit_event_result",
  ADD COLUMN "reason" TEXT,
  ADD COLUMN "request_id" TEXT,
  ADD COLUMN "correlation_id" TEXT,
  ADD COLUMN "ip_address" TEXT,
  ADD COLUMN "user_agent" TEXT;

-- `applied` has always been an explicit, durable result signal for AuditLog,
-- so this is a lossless mapping rather than inference from action/metadata.
UPDATE "audit_logs"
SET "result" = CASE
  WHEN "applied" THEN 'SUCCESS'::"audit_event_result"
  ELSE 'NO_OP'::"audit_event_result"
END
WHERE "result" IS NULL;

ALTER TABLE "security_events"
  ADD CONSTRAINT "security_events_actor_user_id_fkey"
    FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "security_events_subject_user_id_fkey"
    FOREIGN KEY ("subject_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "security_events_actor_user_id_created_at_idx"
  ON "security_events"("actor_user_id", "created_at");
CREATE INDEX "security_events_subject_user_id_created_at_idx"
  ON "security_events"("subject_user_id", "created_at");
CREATE INDEX "security_events_correlation_id_idx"
  ON "security_events"("correlation_id");
CREATE INDEX "audit_logs_actor_user_id_created_at_idx"
  ON "audit_logs"("actor_user_id", "created_at");
CREATE INDEX "audit_logs_correlation_id_idx"
  ON "audit_logs"("correlation_id");
