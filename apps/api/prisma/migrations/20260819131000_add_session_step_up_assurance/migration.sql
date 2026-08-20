-- Nullable, rolling-compatible server-side assurance markers. Existing
-- sessions remain deliberately unverified and therefore fail closed on any
-- route protected by @RequireStepUp().
ALTER TABLE "sessions"
  ADD COLUMN "mfa_verified_at" TIMESTAMPTZ(3),
  ADD COLUMN "recent_authentication_at" TIMESTAMPTZ(3);
