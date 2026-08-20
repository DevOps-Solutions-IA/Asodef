-- A transport timeout after submission is not proof of failure. Keep that
-- result terminal and reviewable instead of blindly retrying a potentially
-- accepted email.
ALTER TYPE "notification_status" ADD VALUE IF NOT EXISTS 'UNKNOWN_RESULT';
