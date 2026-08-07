CREATE TYPE "self_service_portal" AS ENUM ('AFFILIATE', 'COMPANY');
CREATE TYPE "self_service_challenge_status" AS ENUM ('PENDING', 'VERIFIED', 'EXPIRED', 'LOCKED');
CREATE TYPE "self_service_contact_update_status" AS ENUM ('DRAFT', 'CHALLENGE_PENDING', 'VERIFIED', 'SUBMITTED', 'APPLIED', 'REJECTED', 'LOCKED');

CREATE TABLE "self_service_otp_challenges" (
  "id" UUID NOT NULL,
  "access_lookup_id" UUID NOT NULL,
  "portal" "self_service_portal" NOT NULL,
  "lookup_hash" TEXT NOT NULL,
  "subject_ref_encrypted" TEXT NOT NULL,
  "browser_binding_hash" TEXT NOT NULL,
  "channel" TEXT NOT NULL,
  "channel_reference" TEXT NOT NULL,
  "destination_masked" TEXT NOT NULL,
  "code_hash" TEXT NOT NULL,
  "status" "self_service_challenge_status" NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "max_attempts" INTEGER NOT NULL DEFAULT 5,
  "expires_at" TIMESTAMPTZ(3) NOT NULL,
  "retry_available_at" TIMESTAMPTZ(3) NOT NULL,
  "verified_at" TIMESTAMPTZ(3),
  "locked_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "self_service_otp_challenges_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "self_service_access_lookups" (
  "id" UUID NOT NULL,
  "portal" "self_service_portal" NOT NULL,
  "lookup_hash" TEXT NOT NULL,
  "subject_ref_encrypted" TEXT NOT NULL,
  "browser_binding_hash" TEXT NOT NULL,
  "channels" JSONB NOT NULL,
  "destinations_encrypted" TEXT NOT NULL,
  "expires_at" TIMESTAMPTZ(3) NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "self_service_access_lookups_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "self_service_sessions" (
  "id" UUID NOT NULL,
  "challenge_id" UUID NOT NULL,
  "portal" "self_service_portal" NOT NULL,
  "subject_ref_encrypted" TEXT NOT NULL,
  "token_hash" TEXT NOT NULL,
  "csrf_token_hash" TEXT NOT NULL,
  "scopes" TEXT[] NOT NULL,
  "assurance" TEXT NOT NULL,
  "ip_hash" TEXT,
  "user_agent_hash" TEXT,
  "expires_at" TIMESTAMPTZ(3) NOT NULL,
  "last_used_at" TIMESTAMPTZ(3),
  "revoked_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "self_service_sessions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "self_service_idempotency" (
  "id" UUID NOT NULL,
  "session_id" UUID NOT NULL,
  "operation" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "request_hash" TEXT NOT NULL,
  "response" JSONB NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "self_service_idempotency_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "self_service_contact_updates" (
  "id" UUID NOT NULL,
  "session_id" UUID NOT NULL,
  "channel" TEXT NOT NULL,
  "destination_encrypted" TEXT NOT NULL,
  "destination_masked" TEXT NOT NULL,
  "browser_binding_hash" TEXT NOT NULL,
  "code_hash" TEXT,
  "status" "self_service_contact_update_status" NOT NULL DEFAULT 'DRAFT',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "max_attempts" INTEGER NOT NULL DEFAULT 5,
  "expires_at" TIMESTAMPTZ(3) NOT NULL,
  "retry_available_at" TIMESTAMPTZ(3) NOT NULL,
  "verified_at" TIMESTAMPTZ(3),
  "provider_reference" TEXT,
  "applied_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "self_service_contact_updates_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "self_service_audit_events" (
  "id" UUID NOT NULL,
  "portal" "self_service_portal",
  "action" TEXT NOT NULL,
  "outcome" TEXT NOT NULL,
  "challenge_id" UUID,
  "session_id" UUID,
  "subject_hash" TEXT,
  "ip_hash" TEXT,
  "metadata" JSONB,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "self_service_audit_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "self_service_sessions_token_hash_key" ON "self_service_sessions"("token_hash");
CREATE UNIQUE INDEX "self_service_idempotency_session_id_operation_key_key" ON "self_service_idempotency"("session_id", "operation", "key");
CREATE INDEX "self_service_otp_challenges_lookup_hash_created_at_idx" ON "self_service_otp_challenges"("lookup_hash", "created_at");
CREATE INDEX "self_service_otp_challenges_access_lookup_id_idx" ON "self_service_otp_challenges"("access_lookup_id");
CREATE INDEX "self_service_otp_challenges_status_expires_at_idx" ON "self_service_otp_challenges"("status", "expires_at");
CREATE INDEX "self_service_access_lookups_lookup_hash_created_at_idx" ON "self_service_access_lookups"("lookup_hash", "created_at");
CREATE INDEX "self_service_access_lookups_expires_at_idx" ON "self_service_access_lookups"("expires_at");
CREATE INDEX "self_service_sessions_portal_expires_at_idx" ON "self_service_sessions"("portal", "expires_at");
CREATE INDEX "self_service_sessions_challenge_id_idx" ON "self_service_sessions"("challenge_id");
CREATE INDEX "self_service_idempotency_created_at_idx" ON "self_service_idempotency"("created_at");
CREATE INDEX "self_service_contact_updates_session_id_created_at_idx" ON "self_service_contact_updates"("session_id", "created_at");
CREATE INDEX "self_service_contact_updates_status_expires_at_idx" ON "self_service_contact_updates"("status", "expires_at");
CREATE INDEX "self_service_contact_updates_provider_reference_idx" ON "self_service_contact_updates"("provider_reference");
CREATE INDEX "self_service_audit_events_action_created_at_idx" ON "self_service_audit_events"("action", "created_at");
CREATE INDEX "self_service_audit_events_session_id_created_at_idx" ON "self_service_audit_events"("session_id", "created_at");

ALTER TABLE "self_service_sessions" ADD CONSTRAINT "self_service_sessions_challenge_id_fkey" FOREIGN KEY ("challenge_id") REFERENCES "self_service_otp_challenges"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "self_service_otp_challenges" ADD CONSTRAINT "self_service_otp_challenges_access_lookup_id_fkey" FOREIGN KEY ("access_lookup_id") REFERENCES "self_service_access_lookups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "self_service_idempotency" ADD CONSTRAINT "self_service_idempotency_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "self_service_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "self_service_contact_updates" ADD CONSTRAINT "self_service_contact_updates_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "self_service_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
