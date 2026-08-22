CREATE TABLE "admin_idempotency" (
    "id" UUID NOT NULL,
    "actor_user_id" UUID NOT NULL,
    "operation" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "request_hash" TEXT NOT NULL,
    "response" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_idempotency_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "admin_idempotency_actor_user_id_operation_key_key"
  ON "admin_idempotency"("actor_user_id", "operation", "key");
CREATE INDEX "admin_idempotency_created_at_idx" ON "admin_idempotency"("created_at");

ALTER TABLE "admin_idempotency"
  ADD CONSTRAINT "admin_idempotency_actor_user_id_fkey"
  FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
