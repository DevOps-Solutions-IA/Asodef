/**
 * The single, centralized, deterministic role -> landing-area priority
 * rule (US-010 section 1: "do not hardcode routing decisions
 * independently in several components"). Every place that needs to know
 * "where should this user land" - post-login redirect, GuestOnlyRoute
 * sending an already-authenticated visitor away from /iniciar-sesion -
 * calls resolveLandingPath() instead of re-deriving the mapping.
 *
 * Order matters: a user holding multiple roles resolves to the first
 * matching entry, highest-privilege first.
 */
export const ADMINISTRATIVE_ROLES = [
  "SUPER_ADMIN",
  "ADMIN",
  "FINANCE",
  "COMMERCIAL",
  "CUSTOMER_SERVICE",
  "AUDITOR",
] as const;

/** Safe fallback for a user with no roles at all (or a role this table
 * doesn't recognize yet) - still an existing, real, authenticated area
 * rather than an error state. */
const DEFAULT_LANDING_PATH = "/";

export function hasAdministrativeRole(roles: readonly string[]): boolean {
  return ADMINISTRATIVE_ROLES.some((role) => roles.includes(role));
}

export function resolveLandingPath(roles: readonly string[]): string {
  return hasAdministrativeRole(roles) ? "/admin" : DEFAULT_LANDING_PATH;
}
