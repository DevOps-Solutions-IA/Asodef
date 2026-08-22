-- CreateEnum
CREATE TYPE "conversation_status" AS ENUM ('AI_ACTIVE', 'WAITING_USER', 'HUMAN_REQUIRED', 'HUMAN_ACTIVE', 'WAITING_INTERNAL', 'RESOLVED', 'CLOSED');

-- CreateEnum
CREATE TYPE "conversation_channel" AS ENUM ('WEB', 'WHATSAPP', 'INSTAGRAM', 'MESSENGER', 'FUTURE');

-- CreateEnum
CREATE TYPE "conversation_participant_kind" AS ENUM ('EXTERNAL', 'HUMAN_AGENT', 'KORAL', 'SYSTEM');

-- CreateEnum
CREATE TYPE "conversation_message_direction" AS ENUM ('INBOUND', 'OUTBOUND', 'INTERNAL');

-- CreateEnum
CREATE TYPE "conversation_message_status" AS ENUM ('RECEIVED', 'PENDING', 'SENT', 'DELIVERED', 'FAILED');

-- CreateEnum
CREATE TYPE "conversation_priority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');

-- CreateTable
CREATE TABLE "conversations" (
    "id" UUID NOT NULL,
    "status" "conversation_status" NOT NULL DEFAULT 'AI_ACTIVE',
    "priority" "conversation_priority" NOT NULL DEFAULT 'NORMAL',
    "version" INTEGER NOT NULL DEFAULT 0,
    "subject" TEXT,
    "last_message_at" TIMESTAMPTZ(3),
    "sla_due_at" TIMESTAMPTZ(3),
    "resolved_at" TIMESTAMPTZ(3),
    "closed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversation_participants" (
    "id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "kind" "conversation_participant_kind" NOT NULL,
    "channel" "conversation_channel",
    "external_identity_id" TEXT,
    "display_name" TEXT,
    "user_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversation_participants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversation_channel_sessions" (
    "id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "channel" "conversation_channel" NOT NULL,
    "external_session_id" TEXT NOT NULL,
    "adapter_version" TEXT NOT NULL,
    "channel_metadata" JSONB,
    "opened_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closed_at" TIMESTAMPTZ(3),

    CONSTRAINT "conversation_channel_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversation_messages" (
    "id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "channel_session_id" UUID,
    "participant_id" UUID,
    "direction" "conversation_message_direction" NOT NULL,
    "status" "conversation_message_status" NOT NULL,
    "external_message_id" TEXT,
    "content_type" TEXT NOT NULL,
    "body" TEXT,
    "reply_to_message_id" UUID,
    "correlation_id" TEXT,
    "occurred_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversation_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversation_attachments" (
    "id" UUID NOT NULL,
    "message_id" UUID NOT NULL,
    "media_type" TEXT NOT NULL,
    "file_name" TEXT,
    "byte_size" INTEGER,
    "checksum_sha256" TEXT,
    "storage_key" TEXT,
    "external_reference" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversation_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversation_assignments" (
    "id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "assignee_user_id" UUID NOT NULL,
    "assigned_by_user_id" UUID NOT NULL,
    "priority" "conversation_priority" NOT NULL,
    "reason" TEXT,
    "assigned_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "released_at" TIMESTAMPTZ(3),

    CONSTRAINT "conversation_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversation_internal_notes" (
    "id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "author_user_id" UUID NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversation_internal_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversation_tags" (
    "conversation_id" UUID NOT NULL,
    "tag" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversation_tags_pkey" PRIMARY KEY ("conversation_id","tag")
);

-- CreateTable
CREATE TABLE "conversation_events" (
    "id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "event_type" TEXT NOT NULL,
    "actor_user_id" UUID,
    "request_id" TEXT,
    "correlation_id" TEXT,
    "idempotency_key" TEXT,
    "previous_status" TEXT,
    "new_status" TEXT,
    "result" "audit_event_result" NOT NULL DEFAULT 'SUCCESS',
    "reason" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversation_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "conversations_status_priority_updated_at_idx" ON "conversations"("status", "priority", "updated_at");

-- CreateIndex
CREATE INDEX "conversations_sla_due_at_idx" ON "conversations"("sla_due_at");

-- CreateIndex
CREATE INDEX "conversation_participants_user_id_idx" ON "conversation_participants"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "conversation_participants_conversation_id_channel_external__key" ON "conversation_participants"("conversation_id", "channel", "external_identity_id");

-- A human user is represented once per conversation; NULL user ids remain
-- available for channel/system participants under PostgreSQL NULL semantics.
CREATE UNIQUE INDEX "conversation_participants_conversation_id_user_id_key" ON "conversation_participants"("conversation_id", "user_id");

-- CreateIndex
CREATE INDEX "conversation_channel_sessions_conversation_id_last_seen_at_idx" ON "conversation_channel_sessions"("conversation_id", "last_seen_at");

-- CreateIndex
CREATE UNIQUE INDEX "conversation_channel_sessions_channel_external_session_id_key" ON "conversation_channel_sessions"("channel", "external_session_id");

-- CreateIndex
CREATE INDEX "conversation_messages_conversation_id_occurred_at_idx" ON "conversation_messages"("conversation_id", "occurred_at");

-- CreateIndex
CREATE INDEX "conversation_messages_correlation_id_idx" ON "conversation_messages"("correlation_id");

-- CreateIndex
CREATE UNIQUE INDEX "conversation_messages_channel_session_id_external_message_i_key" ON "conversation_messages"("channel_session_id", "external_message_id");

-- CreateIndex
CREATE INDEX "conversation_attachments_message_id_idx" ON "conversation_attachments"("message_id");

-- CreateIndex
CREATE INDEX "conversation_assignments_conversation_id_released_at_idx" ON "conversation_assignments"("conversation_id", "released_at");

-- CreateIndex
CREATE INDEX "conversation_assignments_assignee_user_id_released_at_idx" ON "conversation_assignments"("assignee_user_id", "released_at");

-- CreateIndex
CREATE INDEX "conversation_internal_notes_conversation_id_created_at_idx" ON "conversation_internal_notes"("conversation_id", "created_at");

-- Retries return the exact note created by the first accepted request.
CREATE UNIQUE INDEX "conversation_internal_notes_conversation_id_idempotency_key_key" ON "conversation_internal_notes"("conversation_id", "idempotency_key");

-- CreateIndex
CREATE INDEX "conversation_tags_tag_idx" ON "conversation_tags"("tag");

-- CreateIndex
CREATE INDEX "conversation_events_conversation_id_created_at_idx" ON "conversation_events"("conversation_id", "created_at");

-- CreateIndex
CREATE INDEX "conversation_events_actor_user_id_created_at_idx" ON "conversation_events"("actor_user_id", "created_at");

-- CreateIndex
CREATE INDEX "conversation_events_correlation_id_idx" ON "conversation_events"("correlation_id");

-- CreateIndex
CREATE UNIQUE INDEX "conversation_events_conversation_id_idempotency_key_key" ON "conversation_events"("conversation_id", "idempotency_key");

-- Exactly one live owner prevents concurrent human takeovers from creating
-- split-brain assignment state. Released history remains append-only.
CREATE UNIQUE INDEX "conversation_assignments_one_active_per_conversation_key"
ON "conversation_assignments"("conversation_id") WHERE "released_at" IS NULL;

-- Keep participant identity shapes explicit and prevent invalid attachment
-- metadata at the data boundary even if a future adapter bypasses HTTP DTOs.
ALTER TABLE "conversation_participants" ADD CONSTRAINT "conversation_participants_identity_shape_check"
CHECK (
  ("kind" = 'EXTERNAL' AND "channel" IS NOT NULL AND "external_identity_id" IS NOT NULL AND "user_id" IS NULL)
  OR ("kind" = 'HUMAN_AGENT' AND "channel" IS NULL AND "external_identity_id" IS NULL AND "user_id" IS NOT NULL)
  OR ("kind" IN ('KORAL', 'SYSTEM') AND "channel" IS NULL AND "external_identity_id" IS NULL AND "user_id" IS NULL)
);

ALTER TABLE "conversation_attachments" ADD CONSTRAINT "conversation_attachments_byte_size_check"
CHECK ("byte_size" IS NULL OR "byte_size" >= 0);

ALTER TABLE "conversation_attachments" ADD CONSTRAINT "conversation_attachments_sha256_check"
CHECK ("checksum_sha256" IS NULL OR "checksum_sha256" ~ '^[a-f0-9]{64}$');

-- AddForeignKey
ALTER TABLE "conversation_participants" ADD CONSTRAINT "conversation_participants_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_participants" ADD CONSTRAINT "conversation_participants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_channel_sessions" ADD CONSTRAINT "conversation_channel_sessions_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_messages" ADD CONSTRAINT "conversation_messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_messages" ADD CONSTRAINT "conversation_messages_channel_session_id_fkey" FOREIGN KEY ("channel_session_id") REFERENCES "conversation_channel_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_messages" ADD CONSTRAINT "conversation_messages_participant_id_fkey" FOREIGN KEY ("participant_id") REFERENCES "conversation_participants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_messages" ADD CONSTRAINT "conversation_messages_reply_to_message_id_fkey" FOREIGN KEY ("reply_to_message_id") REFERENCES "conversation_messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_attachments" ADD CONSTRAINT "conversation_attachments_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "conversation_messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_assignments" ADD CONSTRAINT "conversation_assignments_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_assignments" ADD CONSTRAINT "conversation_assignments_assignee_user_id_fkey" FOREIGN KEY ("assignee_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_assignments" ADD CONSTRAINT "conversation_assignments_assigned_by_user_id_fkey" FOREIGN KEY ("assigned_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_internal_notes" ADD CONSTRAINT "conversation_internal_notes_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_internal_notes" ADD CONSTRAINT "conversation_internal_notes_author_user_id_fkey" FOREIGN KEY ("author_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_tags" ADD CONSTRAINT "conversation_tags_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_events" ADD CONSTRAINT "conversation_events_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_events" ADD CONSTRAINT "conversation_events_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
