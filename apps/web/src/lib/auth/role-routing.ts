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
const ROLE_LANDING_PRIORITY: ReadonlyArray<{ roles: readonly string[]; path: string }> = [
  { roles: ["SUPER_ADMIN", "ADMIN"], path: "/admin" },
  { roles: ["COMPANY_PARTNER"], path: "/empresa" },
  { roles: ["CUSTOMER", "AFFILIATE"], path: "/mi-cuenta" },
];

/** Safe fallback for a user with no roles at all (or a role this table
 * doesn't recognize yet) - still an existing, real, authenticated area
 * rather than an error state. */
const DEFAULT_LANDING_PATH = "/mi-cuenta";

export function resolveLandingPath(roles: readonly string[]): string {
  for (const entry of ROLE_LANDING_PRIORITY) {
    if (entry.roles.some((role) => roles.includes(role))) {
      return entry.path;
    }
  }
  return DEFAULT_LANDING_PATH;
}
