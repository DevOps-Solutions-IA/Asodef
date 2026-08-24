-- Additive server-owned browser sessions for Koral Web Chat. Raw cookie
-- capabilities are never persisted; token_digest is an HMAC-SHA-256 digest.
CREATE TYPE "web_chat_processing_status" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'SUPPRESSED', 'FAILED', 'UNKNOWN_RESULT');

CREATE TABLE "web_chat_sessions" (
    "id" UUID NOT NULL,
    "channel_session_id" UUID NOT NULL,
    "token_digest" CHAR(64) NOT NULL,
    "generation" INTEGER NOT NULL DEFAULT 0,
    "identity_id" TEXT NOT NULL,
    "assurance_level" "conversation_identity_assurance" NOT NULL DEFAULT 'ANONYMOUS',
    "claimed_display_name" TEXT,
    "idle_expires_at" TIMESTAMPTZ(3) NOT NULL,
    "absolute_expires_at" TIMESTAMPTZ(3) NOT NULL,
    "last_seen_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "web_chat_sessions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "web_chat_sessions_expiry_order_check" CHECK ("idle_expires_at" <= "absolute_expires_at")
);

CREATE UNIQUE INDEX "web_chat_sessions_channel_session_id_key" ON "web_chat_sessions"("channel_session_id");
CREATE UNIQUE INDEX "web_chat_sessions_token_digest_key" ON "web_chat_sessions"("token_digest");
CREATE UNIQUE INDEX "web_chat_sessions_id_channel_session_id_key" ON "web_chat_sessions"("id", "channel_session_id");
CREATE INDEX "web_chat_sessions_idle_expires_at_idx" ON "web_chat_sessions"("idle_expires_at");
CREATE INDEX "web_chat_sessions_absolute_expires_at_idx" ON "web_chat_sessions"("absolute_expires_at");
CREATE INDEX "web_chat_sessions_revoked_at_idx" ON "web_chat_sessions"("revoked_at");

ALTER TABLE "web_chat_sessions" ADD CONSTRAINT "web_chat_sessions_channel_session_id_fkey"
FOREIGN KEY ("channel_session_id") REFERENCES "conversation_channel_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "web_chat_message_processings" (
    "id" UUID NOT NULL,
    "message_id" UUID NOT NULL,
    "web_chat_session_id" UUID NOT NULL,
    "channel_session_id" UUID NOT NULL,
    "payload_hash" CHAR(64) NOT NULL,
    "status" "web_chat_processing_status" NOT NULL DEFAULT 'PENDING',
    "lease_id" UUID,
    "lease_expires_at" TIMESTAMPTZ(3),
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "outcome_class" TEXT,
    "failure_code" TEXT,
    "completed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "web_chat_message_processings_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "web_chat_message_processings_attempt_count_check" CHECK ("attempt_count" >= 0),
    CONSTRAINT "web_chat_message_processings_lease_shape_check" CHECK (
      ("status" = 'PROCESSING' AND "lease_id" IS NOT NULL AND "lease_expires_at" IS NOT NULL)
      OR ("status" <> 'PROCESSING' AND "lease_id" IS NULL AND "lease_expires_at" IS NULL)
    ),
    CONSTRAINT "web_chat_message_processings_terminal_shape_check" CHECK (
      ("status" IN ('COMPLETED', 'SUPPRESSED', 'FAILED', 'UNKNOWN_RESULT') AND "completed_at" IS NOT NULL)
      OR ("status" IN ('PENDING', 'PROCESSING') AND "completed_at" IS NULL)
    )
);

CREATE UNIQUE INDEX "conversation_messages_id_channel_session_id_key" ON "conversation_messages"("id", "channel_session_id");
CREATE UNIQUE INDEX "web_chat_message_processings_message_id_key" ON "web_chat_message_processings"("message_id");
CREATE UNIQUE INDEX "web_chat_message_processings_message_channel_key" ON "web_chat_message_processings"("message_id", "channel_session_id");
CREATE INDEX "web_chat_message_processings_session_status_idx" ON "web_chat_message_processings"("web_chat_session_id", "status", "updated_at");
CREATE INDEX "web_chat_message_processings_lease_idx" ON "web_chat_message_processings"("status", "lease_expires_at");

ALTER TABLE "web_chat_message_processings" ADD CONSTRAINT "web_chat_message_processings_message_id_channel_session_id_fkey"
FOREIGN KEY ("message_id", "channel_session_id") REFERENCES "conversation_messages"("id", "channel_session_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "web_chat_message_processings" ADD CONSTRAINT "web_chat_message_processings_web_chat_session_id_channel_s_fkey"
FOREIGN KEY ("web_chat_session_id", "channel_session_id") REFERENCES "web_chat_sessions"("id", "channel_session_id") ON DELETE RESTRICT ON UPDATE CASCADE;
