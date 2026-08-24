-- Additive ASODEF Connect runtime persistence. Existing business, mail and
-- conversation tables remain authoritative for their own domains.
ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS 'COMMUNICATION';

CREATE TYPE "connect_domain_event_status" AS ENUM ('RECEIVED', 'DISPATCHED', 'REJECTED');
CREATE TYPE "connect_automation_lifecycle" AS ENUM ('DRAFT', 'REVIEW', 'PUBLISHED', 'ACTIVE', 'DISABLED', 'RETIRED');
CREATE TYPE "connect_automation_trigger_type" AS ENUM ('EVENT', 'SCHEDULE', 'MANUAL_AUTHORIZED');
CREATE TYPE "connect_automation_execution_mode" AS ENUM ('EVENT', 'SCHEDULE', 'MANUAL_AUTHORIZED');
CREATE TYPE "connect_automation_execution_status" AS ENUM ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED', 'DEAD_LETTER', 'CANCELLED');
CREATE TYPE "connect_automation_step_status" AS ENUM ('PENDING', 'RUNNING', 'SUCCEEDED', 'RETRY_PENDING', 'FAILED', 'SKIPPED', 'DEAD_LETTER');
CREATE TYPE "connect_dead_letter_resolution" AS ENUM ('UNRESOLVED', 'REQUEUED_AUTHORIZED', 'RESOLVED_NO_RETRY');
CREATE TYPE "connect_communication_status" AS ENUM ('REQUESTED', 'SUPPRESSED', 'QUEUED', 'DELIVERED', 'FAILED', 'UNKNOWN_RESULT', 'DEAD_LETTER');
CREATE TYPE "connect_recipient_decision" AS ENUM ('ALLOWED', 'SUPPRESSED');

CREATE TABLE "connect_domain_events" (
  "event_id" UUID NOT NULL,
  "event_type" TEXT NOT NULL,
  "schema_version" INTEGER NOT NULL,
  "occurred_at" TIMESTAMPTZ(3) NOT NULL,
  "producer" TEXT NOT NULL,
  "subject_type" TEXT NOT NULL,
  "subject_id" TEXT NOT NULL,
  "correlation_id" TEXT NOT NULL,
  "causation_id" TEXT,
  "idempotency_key" TEXT NOT NULL,
  "envelope_hash" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "status" "connect_domain_event_status" NOT NULL DEFAULT 'RECEIVED',
  "failure_reason" TEXT,
  "dispatched_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "connect_domain_events_pkey" PRIMARY KEY ("event_id")
);

CREATE TABLE "connect_automations" (
  "id" UUID NOT NULL,
  "key" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "status" "connect_automation_lifecycle" NOT NULL DEFAULT 'DRAFT',
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "connect_automations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "connect_automation_versions" (
  "id" UUID NOT NULL,
  "automation_id" UUID NOT NULL,
  "version" INTEGER NOT NULL,
  "status" "connect_automation_lifecycle" NOT NULL DEFAULT 'DRAFT',
  "trigger_type" "connect_automation_trigger_type" NOT NULL,
  "trigger" JSONB NOT NULL,
  "conditions" JSONB NOT NULL,
  "actions" JSONB NOT NULL,
  "execution_policy" JSONB NOT NULL,
  "created_by" TEXT NOT NULL,
  "reviewed_by" TEXT,
  "published_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "connect_automation_versions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "connect_automation_executions" (
  "id" UUID NOT NULL,
  "automation_version_id" UUID NOT NULL,
  "domain_event_id" UUID,
  "mode" "connect_automation_execution_mode" NOT NULL,
  "status" "connect_automation_execution_status" NOT NULL DEFAULT 'PENDING',
  "trigger_reference" TEXT NOT NULL,
  "idempotency_key" TEXT NOT NULL,
  "correlation_id" TEXT NOT NULL,
  "causation_id" TEXT,
  "requested_by" TEXT,
  "started_at" TIMESTAMPTZ(3),
  "finished_at" TIMESTAMPTZ(3),
  "failure_code" TEXT,
  "failure_retryable" BOOLEAN,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "connect_automation_executions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "connect_automation_execution_steps" (
  "id" UUID NOT NULL,
  "execution_id" UUID NOT NULL,
  "action_index" INTEGER NOT NULL,
  "action_type" TEXT NOT NULL,
  "status" "connect_automation_step_status" NOT NULL DEFAULT 'PENDING',
  "attempt_count" INTEGER NOT NULL DEFAULT 0,
  "next_attempt_at" TIMESTAMPTZ(3),
  "started_at" TIMESTAMPTZ(3),
  "finished_at" TIMESTAMPTZ(3),
  "failure_code" TEXT,
  "failure_retryable" BOOLEAN,
  "output" JSONB,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "connect_automation_execution_steps_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "connect_automation_retries" (
  "id" UUID NOT NULL,
  "step_id" UUID NOT NULL,
  "attempt" INTEGER NOT NULL,
  "scheduled_at" TIMESTAMPTZ(3) NOT NULL,
  "started_at" TIMESTAMPTZ(3),
  "finished_at" TIMESTAMPTZ(3),
  "failure_code" TEXT,
  "retryable" BOOLEAN,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "connect_automation_retries_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "connect_automation_dead_letters" (
  "id" UUID NOT NULL,
  "execution_id" UUID NOT NULL,
  "step_id" UUID,
  "reason_code" TEXT NOT NULL,
  "retry_count" INTEGER NOT NULL,
  "correlation_id" TEXT NOT NULL,
  "resolution" "connect_dead_letter_resolution" NOT NULL DEFAULT 'UNRESOLVED',
  "resolved_by" TEXT,
  "resolved_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "connect_automation_dead_letters_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "connect_communications" (
  "id" UUID NOT NULL,
  "request_id" TEXT NOT NULL,
  "requested_by" TEXT NOT NULL,
  "idempotency_key" TEXT NOT NULL,
  "request_hash" TEXT NOT NULL,
  "channel" TEXT NOT NULL,
  "purpose" "communication_kind" NOT NULL,
  "data_classification" TEXT NOT NULL,
  "template_key" TEXT NOT NULL,
  "template_version" INTEGER NOT NULL,
  "correlation_id" TEXT NOT NULL,
  "causation_id" TEXT,
  "status" "connect_communication_status" NOT NULL DEFAULT 'REQUESTED',
  "failure_reason" TEXT,
  "completed_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "connect_communications_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "connect_communication_recipients" (
  "id" UUID NOT NULL,
  "communication_id" UUID NOT NULL,
  "recipient_index" INTEGER NOT NULL,
  "recipient_type" TEXT NOT NULL,
  "address" TEXT NOT NULL,
  "subject_type" TEXT,
  "subject_id" TEXT,
  "decision" "connect_recipient_decision" NOT NULL,
  "decision_reason" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "connect_communication_recipients_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "connect_domain_events_producer_idempotency_key_key" ON "connect_domain_events"("producer", "idempotency_key");
CREATE INDEX "connect_domain_events_event_type_schema_version_status_idx" ON "connect_domain_events"("event_type", "schema_version", "status");
CREATE INDEX "connect_domain_events_correlation_id_idx" ON "connect_domain_events"("correlation_id");
CREATE UNIQUE INDEX "connect_automations_key_key" ON "connect_automations"("key");
CREATE INDEX "connect_automations_status_idx" ON "connect_automations"("status");
CREATE UNIQUE INDEX "connect_automation_versions_automation_id_version_key" ON "connect_automation_versions"("automation_id", "version");
CREATE INDEX "connect_automation_versions_status_trigger_type_idx" ON "connect_automation_versions"("status", "trigger_type");
CREATE UNIQUE INDEX "connect_automation_executions_automation_version_id_mode_id_key" ON "connect_automation_executions"("automation_version_id", "mode", "idempotency_key");
CREATE INDEX "connect_automation_executions_status_created_at_idx" ON "connect_automation_executions"("status", "created_at");
CREATE INDEX "connect_automation_executions_domain_event_id_idx" ON "connect_automation_executions"("domain_event_id");
CREATE INDEX "connect_automation_executions_correlation_id_idx" ON "connect_automation_executions"("correlation_id");
CREATE UNIQUE INDEX "connect_automation_execution_steps_execution_id_action_inde_key" ON "connect_automation_execution_steps"("execution_id", "action_index");
CREATE INDEX "connect_automation_execution_steps_status_next_attempt_at_idx" ON "connect_automation_execution_steps"("status", "next_attempt_at");
CREATE UNIQUE INDEX "connect_automation_retries_step_id_attempt_key" ON "connect_automation_retries"("step_id", "attempt");
CREATE UNIQUE INDEX "connect_automation_dead_letters_execution_id_key" ON "connect_automation_dead_letters"("execution_id");
CREATE UNIQUE INDEX "connect_automation_dead_letters_step_id_key" ON "connect_automation_dead_letters"("step_id");
CREATE INDEX "connect_automation_dead_letters_resolution_created_at_idx" ON "connect_automation_dead_letters"("resolution", "created_at");
CREATE INDEX "connect_automation_dead_letters_correlation_id_idx" ON "connect_automation_dead_letters"("correlation_id");
CREATE UNIQUE INDEX "connect_communications_requested_by_idempotency_key_key" ON "connect_communications"("requested_by", "idempotency_key");
CREATE UNIQUE INDEX "connect_communications_requested_by_request_id_key" ON "connect_communications"("requested_by", "request_id");
CREATE INDEX "connect_communications_status_created_at_idx" ON "connect_communications"("status", "created_at");
CREATE INDEX "connect_communications_correlation_id_idx" ON "connect_communications"("correlation_id");
CREATE UNIQUE INDEX "connect_communication_recipients_communication_id_recipient_key" ON "connect_communication_recipients"("communication_id", "recipient_index");
CREATE INDEX "connect_communication_recipients_subject_type_subject_id_idx" ON "connect_communication_recipients"("subject_type", "subject_id");

ALTER TABLE "connect_automation_versions" ADD CONSTRAINT "connect_automation_versions_automation_id_fkey" FOREIGN KEY ("automation_id") REFERENCES "connect_automations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "connect_automation_executions" ADD CONSTRAINT "connect_automation_executions_automation_version_id_fkey" FOREIGN KEY ("automation_version_id") REFERENCES "connect_automation_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "connect_automation_executions" ADD CONSTRAINT "connect_automation_executions_domain_event_id_fkey" FOREIGN KEY ("domain_event_id") REFERENCES "connect_domain_events"("event_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "connect_automation_execution_steps" ADD CONSTRAINT "connect_automation_execution_steps_execution_id_fkey" FOREIGN KEY ("execution_id") REFERENCES "connect_automation_executions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "connect_automation_retries" ADD CONSTRAINT "connect_automation_retries_step_id_fkey" FOREIGN KEY ("step_id") REFERENCES "connect_automation_execution_steps"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "connect_automation_dead_letters" ADD CONSTRAINT "connect_automation_dead_letters_execution_id_fkey" FOREIGN KEY ("execution_id") REFERENCES "connect_automation_executions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "connect_automation_dead_letters" ADD CONSTRAINT "connect_automation_dead_letters_step_id_fkey" FOREIGN KEY ("step_id") REFERENCES "connect_automation_execution_steps"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "connect_communication_recipients" ADD CONSTRAINT "connect_communication_recipients_communication_id_fkey" FOREIGN KEY ("communication_id") REFERENCES "connect_communications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "notification_jobs" ADD COLUMN "communication_id" UUID;
CREATE INDEX "notification_jobs_communication_id_idx" ON "notification_jobs"("communication_id");
ALTER TABLE "notification_jobs" ADD CONSTRAINT "notification_jobs_communication_id_fkey" FOREIGN KEY ("communication_id") REFERENCES "connect_communications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
