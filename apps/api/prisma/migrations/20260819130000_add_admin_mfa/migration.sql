CREATE TYPE "admin_mfa_credential_status" AS ENUM ('PENDING', 'ACTIVE', 'REVOKED');

ALTER TYPE "security_event_type" ADD VALUE 'MFA_ENROLLMENT_STARTED';
ALTER TYPE "security_event_type" ADD VALUE 'MFA_ENABLED';
ALTER TYPE "security_event_type" ADD VALUE 'MFA_CHALLENGE_ISSUED';
ALTER TYPE "security_event_type" ADD VALUE 'MFA_VERIFIED';
ALTER TYPE "security_event_type" ADD VALUE 'MFA_FAILED';
ALTER TYPE "security_event_type" ADD VALUE 'MFA_RECOVERY_CODE_USED';
ALTER TYPE "security_event_type" ADD VALUE 'MFA_RECOVERY_CODES_REGENERATED';
ALTER TYPE "security_event_type" ADD VALUE 'MFA_REVOKED';

CREATE TABLE "admin_mfa_credentials" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "status" "admin_mfa_credential_status" NOT NULL DEFAULT 'PENDING',
    "secret_encrypted" TEXT NOT NULL,
    "last_used_counter" INTEGER,
    "pending_expires_at" TIMESTAMPTZ(3),
    "confirmed_at" TIMESTAMPTZ(3),
    "revoked_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "admin_mfa_credentials_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "admin_mfa_recovery_codes" (
    "id" UUID NOT NULL,
    "credential_id" UUID NOT NULL,
    "code_hash" TEXT NOT NULL,
    "used_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_mfa_recovery_codes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "admin_mfa_login_challenges" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "request_id" TEXT,
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "used_at" TIMESTAMPTZ(3),

    CONSTRAINT "admin_mfa_login_challenges_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "admin_mfa_credentials_user_id_key" ON "admin_mfa_credentials"("user_id");
CREATE INDEX "admin_mfa_credentials_status_idx" ON "admin_mfa_credentials"("status");
CREATE INDEX "admin_mfa_recovery_codes_credential_id_used_at_idx" ON "admin_mfa_recovery_codes"("credential_id", "used_at");
CREATE UNIQUE INDEX "admin_mfa_login_challenges_token_hash_key" ON "admin_mfa_login_challenges"("token_hash");
CREATE INDEX "admin_mfa_login_challenges_user_id_created_at_idx" ON "admin_mfa_login_challenges"("user_id", "created_at");
CREATE INDEX "admin_mfa_login_challenges_expires_at_idx" ON "admin_mfa_login_challenges"("expires_at");

ALTER TABLE "admin_mfa_credentials" ADD CONSTRAINT "admin_mfa_credentials_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "admin_mfa_recovery_codes" ADD CONSTRAINT "admin_mfa_recovery_codes_credential_id_fkey"
  FOREIGN KEY ("credential_id") REFERENCES "admin_mfa_credentials"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "admin_mfa_login_challenges" ADD CONSTRAINT "admin_mfa_login_challenges_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
