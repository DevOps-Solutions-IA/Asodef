import { ForbiddenException } from "@nestjs/common";
import type { ActorScope, ResourceOwnership } from "./authorization-context.type";

const SAFE_FORBIDDEN_MESSAGE = "No tienes acceso a este recurso.";

export interface OwnershipCheckOptions {
  /**
   * A role name (e.g. "ADMIN", "SUPER_ADMIN") that grants an explicit
   * administrative override, bypassing the ownership check entirely.
   * There is deliberately no implicit/default override - a caller must
   * pass this explicitly every time, so "who can see everything" is
   * always a visible, reviewable decision at the call site, never a
   * hidden default inside this shared module.
   */
  overrideRoles?: string[];
  actorRoles?: string[];
}

/**
 * Row-level ("does this actor own this specific record") authorization,
 * layered *underneath* RBAC (US-008 section 5). RBAC answers "can a
 * CUSTOMER read payments at all"; OwnershipPolicy answers "can *this*
 * customer read *this* payment". Domain services must call this
 * explicitly for every resource-scoped read/write - it is never wired
 * into a guard automatically, because only the service loading the
 * resource knows both the resource's ownership fields and the actor's
 * own scope.
 *
 * Fails closed: a resource that declares *no* ownership dimension at all
 * is never accessible via ownership alone (only via an explicit
 * overrideRole) - this is what prevents "a broad generic filter that
 * could silently fail open" (a resource type that forgets to declare its
 * owner does not become world-readable, it becomes admin-only).
 */
export class OwnershipPolicy {
  static ownsResource(actorScope: ActorScope, resource: ResourceOwnership): boolean {
    const declaredChecks: Array<[string | null | undefined, string | null | undefined]> = [];

    if (resource.ownerUserId !== undefined && resource.ownerUserId !== null) {
      declaredChecks.push([actorScope.userId, resource.ownerUserId]);
    }
    if (resource.customerId !== undefined && resource.customerId !== null) {
      declaredChecks.push([actorScope.customerId, resource.customerId]);
    }
    if (resource.affiliateId !== undefined && resource.affiliateId !== null) {
      declaredChecks.push([actorScope.affiliateId, resource.affiliateId]);
    }
    if (resource.companyId !== undefined && resource.companyId !== null) {
      declaredChecks.push([actorScope.companyId, resource.companyId]);
    }
    if (resource.organizationId !== undefined && resource.organizationId !== null) {
      declaredChecks.push([actorScope.organizationId, resource.organizationId]);
    }

    if (declaredChecks.length === 0) {
      return false;
    }
    return declaredChecks.every(([actorValue, resourceValue]) => !!actorValue && actorValue === resourceValue);
  }

  private static hasOverride(options?: OwnershipCheckOptions): boolean {
    if (!options?.overrideRoles || !options.actorRoles) return false;
    return options.overrideRoles.some((role) => options.actorRoles!.includes(role));
  }

  /** Throws a generic ForbiddenException (never naming the resource,
   * the missing field, or the other tenant) unless the actor owns the
   * resource or an explicitly-passed override role applies. */
  static assertCanAccessResource(actorScope: ActorScope, resource: ResourceOwnership, options?: OwnershipCheckOptions): void {
    if (this.hasOverride(options) || this.ownsResource(actorScope, resource)) return;
    throw new ForbiddenException(SAFE_FORBIDDEN_MESSAGE);
  }

  /** Same rule as assertCanAccessResource today - kept as a distinct,
   * separately-named primitive (US-008 section 5) so a future resource
   * type that is owner-*readable* but staff-only-*writable* can diverge
   * without touching every read-side call site. */
  static assertCanModifyResource(actorScope: ActorScope, resource: ResourceOwnership, options?: OwnershipCheckOptions): void {
    if (this.hasOverride(options) || this.ownsResource(actorScope, resource)) return;
    throw new ForbiddenException(SAFE_FORBIDDEN_MESSAGE);
  }
}
