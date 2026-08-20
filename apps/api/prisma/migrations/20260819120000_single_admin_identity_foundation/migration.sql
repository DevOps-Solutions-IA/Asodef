-- Forward-compatible foundation for the privileged administrative identity.
-- recovery_email intentionally remains nullable during the rolling deployment;
-- application policy fails closed for the official privileged account.
ALTER TABLE "users"
  ADD COLUMN "recovery_email" TEXT,
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 0;

-- The two addresses are institutional identifiers, not secrets. This bounded,
-- idempotent backfill affects only the already-established official account.
UPDATE "users"
SET "recovery_email" = 'asodefsas@gmail.com'
WHERE LOWER("email") = 'admin@asodef.com.co'
  AND "recovery_email" IS NULL;
