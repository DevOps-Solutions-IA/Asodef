import { ForbiddenException } from "@nestjs/common";

const SAFE_FORBIDDEN_MESSAGE = "No tienes acceso a este recurso.";

/**
 * A lighter-weight, single-dimension sibling of OwnershipPolicy for
 * straightforward tenant/organization boundaries (US-008 section 5) -
 * e.g. "is this record within the same company as the acting
 * COMPANY_PARTNER user". Two null/undefined values are never considered
 * a match (fails closed rather than treating "unknown vs. unknown" as
 * "same").
 */
export class OrganizationScopePolicy {
  static isSameOrganization(actorOrganizationId: string | null | undefined, resourceOrganizationId: string | null | undefined): boolean {
    return !!actorOrganizationId && !!resourceOrganizationId && actorOrganizationId === resourceOrganizationId;
  }

  static assertSameOrganization(
    actorOrganizationId: string | null | undefined,
    resourceOrganizationId: string | null | undefined,
  ): void {
    if (this.isSameOrganization(actorOrganizationId, resourceOrganizationId)) return;
    throw new ForbiddenException(SAFE_FORBIDDEN_MESSAGE);
  }
}
