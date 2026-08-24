-- Per-operator read cursors for the Human Inbox. Queue views remain derived
-- from canonical conversation status and active assignment.
CREATE TABLE "conversation_read_states" (
    "conversation_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "last_read_message_id" UUID,
    "last_read_at" TIMESTAMPTZ(3) NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "conversation_read_states_pkey" PRIMARY KEY ("conversation_id", "user_id")
);

CREATE INDEX "conversation_read_states_user_id_updated_at_idx"
ON "conversation_read_states"("user_id", "updated_at");

CREATE INDEX "conversation_read_states_last_read_message_id_idx"
ON "conversation_read_states"("last_read_message_id");

CREATE UNIQUE INDEX "conversation_messages_conversation_id_id_uq"
ON "conversation_messages"("conversation_id", "id");

ALTER TABLE "conversation_read_states"
ADD CONSTRAINT "conversation_read_states_conversation_id_fkey"
FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "conversation_read_states"
ADD CONSTRAINT "conversation_read_states_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "conversation_read_states"
ADD CONSTRAINT "conversation_read_states_conversation_id_last_read_message_fkey"
FOREIGN KEY ("conversation_id", "last_read_message_id") REFERENCES "conversation_messages"("conversation_id", "id")
ON DELETE RESTRICT ON UPDATE CASCADE;
