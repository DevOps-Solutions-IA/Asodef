-- CreateEnum
CREATE TYPE "session_revocation_reason" AS ENUM ('LOGOUT', 'LOGOUT_ALL', 'REFRESH_TOKEN_REUSE_DETECTED', 'ADMIN_ACTION', 'PASSWORD_RESET', 'EXPIRED_CLEANUP');

-- CreateEnum
CREATE TYPE "login_failure_category" AS ENUM ('INVALID_CREDENTIALS', 'ACCOUNT_LOCKED', 'ACCOUNT_INACTIVE', 'ACCOUNT_SUSPENDED', 'RATE_LIMITED');

-- CreateEnum
CREATE TYPE "security_event_type" AS ENUM ('LOGIN_SUCCEEDED', 'LOGIN_FAILED', 'ACCOUNT_LOCKED', 'ACCOUNT_UNLOCKED', 'SESSION_CREATED', 'SESSION_REFRESHED', 'REFRESH_TOKEN_REUSE_DETECTED', 'SESSION_REVOKED', 'LOGOUT', 'LOGOUT_ALL');

-- AlterTable
ALTER TABLE "login_attempts" ADD COLUMN     "failure_category" "login_failure_category",
ADD COLUMN     "request_id" TEXT,
ADD COLUMN     "user_agent" TEXT,
ADD COLUMN     "user_id" UUID;

-- AlterTable
ALTER TABLE "sessions" ADD COLUMN     "family_id" UUID NOT NULL,
ADD COLUMN     "last_used_at" TIMESTAMPTZ(3),
ADD COLUMN     "revoked_reason" "session_revocation_reason",
ADD COLUMN     "rotated_at" TIMESTAMPTZ(3),
ADD COLUMN     "rotated_to_session_id" UUID;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "failed_login_attempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "last_login_at" TIMESTAMPTZ(3),
ADD COLUMN     "locked_until" TIMESTAMPTZ(3);

-- CreateTable
CREATE TABLE "security_events" (
    "id" UUID NOT NULL,
    "type" "security_event_type" NOT NULL,
    "user_id" UUID,
    "session_id" UUID,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "request_id" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "security_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "security_events_user_id_created_at_idx" ON "security_events"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "security_events_type_created_at_idx" ON "security_events"("type", "created_at");

-- CreateIndex
CREATE INDEX "login_attempts_user_id_created_at_idx" ON "login_attempts"("user_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_rotated_to_session_id_key" ON "sessions"("rotated_to_session_id");

-- CreateIndex
CREATE INDEX "sessions_family_id_idx" ON "sessions"("family_id");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_rotated_to_session_id_fkey" FOREIGN KEY ("rotated_to_session_id") REFERENCES "sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "login_attempts" ADD CONSTRAINT "login_attempts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "security_events" ADD CONSTRAINT "security_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "security_events" ADD CONSTRAINT "security_events_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

