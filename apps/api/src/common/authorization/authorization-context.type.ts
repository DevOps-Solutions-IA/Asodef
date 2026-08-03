import type { RequestUser } from "../../modules/auth/types/request-user.type";

/**
 * Who is making the request (US-008). Derived directly from the safe
 * RequestUser the JwtAuthGuard already populates - never re-fetched, never
 * trusted from client input. Roles/permissions here are RBAC capability
 * grants only; they say nothing about which specific records this actor
 * may touch - that is what ActorScope + the ownership/organization-scope
 * policies below are for.
 */
export interface AuthorizationContext {
  actorId: string;
  actorRoles: string[];
  actorPermissions: string[];
}

export function toAuthorizationContext(user: RequestUser): AuthorizationContext {
  return { actorId: user.id, actorRoles: user.roles, actorPermissions: user.permissions };
}

/**
 * The actor's own position within whatever scoping dimensions a resource
 * might declare. None of these fields exist on User yet (no Customer/
 * Affiliate/Company domain tables exist as of US-008) - callers (a future
 * domain service that DOES have those relations) are responsible for
 * resolving them and passing the result in. This module intentionally
 * never queries the database itself, so it stays a pure, synchronously
 * testable authorization primitive with zero risk of silently joining
 * across the wrong table.
 */
export interface ActorScope {
  userId: string;
  customerId?: string | null;
  affiliateId?: string | null;
  companyId?: string | null;
  organizationId?: string | null;
}

/**
 * The ownership dimensions a specific resource instance declares. A
 * resource only sets the dimensions that are meaningful for its type
 * (e.g. a Payment sets customerId; a Contract sets companyId) - unset
 * (undefined/null) dimensions are not evaluated by OwnershipPolicy.
 */
export interface ResourceOwnership {
  ownerUserId?: string | null;
  customerId?: string | null;
  affiliateId?: string | null;
  companyId?: string | null;
  organizationId?: string | null;
}
