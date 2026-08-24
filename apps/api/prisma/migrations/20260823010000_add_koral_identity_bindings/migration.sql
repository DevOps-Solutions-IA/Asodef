CREATE TYPE "conversation_identity_assurance" AS ENUM (
  'ANONYMOUS',
  'CLAIMED',
  'MATCHED',
  'VERIFIED',
  'AUTHENTICATED',
  'MFA_VERIFIED',
  'STEP_UP_VERIFIED'
);

CREATE TABLE "conversation_identity_bindings" (
  "id" UUID NOT NULL,
  "conversation_id" UUID NOT NULL,
  "identity_id" TEXT NOT NULL,
  "contact_id" TEXT,
  "portal_user_id" TEXT,
  "previous_assurance" "conversation_identity_assurance",
  "new_assurance" "conversation_identity_assurance" NOT NULL,
  "reason" TEXT NOT NULL,
  "evidence_reference" TEXT NOT NULL,
  "correlation_id" TEXT NOT NULL,
  "idempotency_key" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "conversation_identity_bindings_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "conversation_identity_bindings_nonempty_check" CHECK (
    length(btrim("identity_id")) BETWEEN 1 AND 200
    AND length(btrim("reason")) BETWEEN 1 AND 500
    AND length(btrim("evidence_reference")) BETWEEN 1 AND 200
    AND length(btrim("correlation_id")) BETWEEN 1 AND 200
    AND length(btrim("idempotency_key")) BETWEEN 1 AND 200
  )
);

CREATE UNIQUE INDEX "conversation_identity_bindings_idempotency_uq"
  ON "conversation_identity_bindings"("conversation_id", "idempotency_key");
CREATE INDEX "conversation_identity_bindings_timeline_idx"
  ON "conversation_identity_bindings"("conversation_id", "created_at", "id");
CREATE INDEX "conversation_identity_bindings_identity_id_created_at_idx"
  ON "conversation_identity_bindings"("identity_id", "created_at");
CREATE INDEX "conversation_identity_bindings_correlation_id_idx"
  ON "conversation_identity_bindings"("correlation_id");

ALTER TABLE "conversation_identity_bindings"
  ADD CONSTRAINT "conversation_identity_bindings_conversation_id_fkey"
  FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
