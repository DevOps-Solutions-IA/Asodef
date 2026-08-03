import { SetMetadata } from "@nestjs/common";

export const ROLES_KEY = "requiredRoles";

/**
 * Declares which role *names* a route requires - justified only for the
 * small set of platform-governance actions that must remain tied to a
 * specific role rather than a composable permission (e.g. "only
 * SUPER_ADMIN may do this", matching the ADMIN/SUPER_ADMIN separation
 * from US-003's rbac-catalog.ts). Prefer @RequirePermissions() for
 * everything else. Enforced by RolesGuard.
 */
export const RequireRoles = (...roleNames: string[]) => SetMetadata(ROLES_KEY, roleNames);
