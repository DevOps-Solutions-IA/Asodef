import { SetMetadata } from "@nestjs/common";

export const PERMISSIONS_KEY = "requiredPermissions";

/**
 * Declares which permission keys (from the seeded catalog - see
 * database/rbac-catalog.ts) a route requires. Enforced by
 * PermissionsGuard. Roles/permissions grant *capabilities* only - they do
 * not express row-level ownership (a CUSTOMER having payments.read still
 * must be scoped to their own records by the service layer, not by this
 * guard).
 */
export const RequirePermissions = (...keys: string[]) => SetMetadata(PERMISSIONS_KEY, keys);
