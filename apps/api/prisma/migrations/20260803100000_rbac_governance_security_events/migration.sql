-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "security_event_type" ADD VALUE 'AUTHORIZATION_DENIED';
ALTER TYPE "security_event_type" ADD VALUE 'ROLE_ASSIGNED';
ALTER TYPE "security_event_type" ADD VALUE 'ROLE_REMOVED';
ALTER TYPE "security_event_type" ADD VALUE 'PERMISSION_GRANTED';
ALTER TYPE "security_event_type" ADD VALUE 'PERMISSION_REVOKED';
ALTER TYPE "security_event_type" ADD VALUE 'GOVERNANCE_CHANGE_ATTEMPTED';
ALTER TYPE "security_event_type" ADD VALUE 'SCOPE_VIOLATION_ATTEMPTED';

