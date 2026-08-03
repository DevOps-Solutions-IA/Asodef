-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "security_event_type" ADD VALUE 'LOCKOUT_EXPIRED';
ALTER TYPE "security_event_type" ADD VALUE 'LOCKOUT_RATE_LIMITED';
ALTER TYPE "security_event_type" ADD VALUE 'ACCOUNT_UNLOCK_FAILED';
ALTER TYPE "security_event_type" ADD VALUE 'ADMINISTRATIVE_UNLOCK';

