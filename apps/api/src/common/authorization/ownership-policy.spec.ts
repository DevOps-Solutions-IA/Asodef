import { ForbiddenException } from "@nestjs/common";
import { OwnershipPolicy } from "./ownership-policy";
import type { ActorScope, ResourceOwnership } from "./authorization-context.type";

describe("OwnershipPolicy", () => {
  describe("ownsResource", () => {
    it("grants access when the resource's customerId matches the actor's own customerId", () => {
      const actor: ActorScope = { userId: "u1", customerId: "cust-1" };
      const resource: ResourceOwnership = { customerId: "cust-1" };
      expect(OwnershipPolicy.ownsResource(actor, resource)).toBe(true);
    });

    it("denies a CUSTOMER access to another customer's resource (cross-customer denial)", () => {
      const actor: ActorScope = { userId: "u1", customerId: "cust-1" };
      const resource: ResourceOwnership = { customerId: "cust-2" };
      expect(OwnershipPolicy.ownsResource(actor, resource)).toBe(false);
    });

    it("denies an AFFILIATE access to another affiliate's resource (cross-affiliate denial)", () => {
      const actor: ActorScope = { userId: "u1", affiliateId: "aff-1" };
      const resource: ResourceOwnership = { affiliateId: "aff-2" };
      expect(OwnershipPolicy.ownsResource(actor, resource)).toBe(false);
    });

    it("grants an AFFILIATE access only to a resource explicitly linked to that same affiliate", () => {
      const actor: ActorScope = { userId: "u1", affiliateId: "aff-1" };
      const resource: ResourceOwnership = { affiliateId: "aff-1" };
      expect(OwnershipPolicy.ownsResource(actor, resource)).toBe(true);
    });

    it("denies a COMPANY_PARTNER access to another company's resource (cross-company denial)", () => {
      const actor: ActorScope = { userId: "u1", companyId: "comp-1" };
      const resource: ResourceOwnership = { companyId: "comp-2" };
      expect(OwnershipPolicy.ownsResource(actor, resource)).toBe(false);
    });

    it("grants a COMPANY_PARTNER access to its own company's resource", () => {
      const actor: ActorScope = { userId: "u1", companyId: "comp-1" };
      const resource: ResourceOwnership = { companyId: "comp-1" };
      expect(OwnershipPolicy.ownsResource(actor, resource)).toBe(true);
    });

    it("grants access via ownerUserId when the actor is the direct owner", () => {
      const actor: ActorScope = { userId: "u1" };
      const resource: ResourceOwnership = { ownerUserId: "u1" };
      expect(OwnershipPolicy.ownsResource(actor, resource)).toBe(true);
    });

    it("denies access via ownerUserId when the actor is not the owner", () => {
      const actor: ActorScope = { userId: "u1" };
      const resource: ResourceOwnership = { ownerUserId: "u2" };
      expect(OwnershipPolicy.ownsResource(actor, resource)).toBe(false);
    });

    it("fails closed (denies) when the resource declares no ownership dimension at all", () => {
      const actor: ActorScope = { userId: "u1", customerId: "cust-1", affiliateId: "aff-1", companyId: "comp-1" };
      const resource: ResourceOwnership = {};
      expect(OwnershipPolicy.ownsResource(actor, resource)).toBe(false);
    });

    it("requires every declared dimension to match when a resource declares more than one", () => {
      const actor: ActorScope = { userId: "u1", customerId: "cust-1", companyId: "comp-1" };
      const partiallyMatching: ResourceOwnership = { customerId: "cust-1", companyId: "comp-DIFFERENT" };
      expect(OwnershipPolicy.ownsResource(actor, partiallyMatching)).toBe(false);
    });

    it("never treats two undefined/null values as a match", () => {
      const actor: ActorScope = { userId: "u1" };
      const resource: ResourceOwnership = { customerId: null };
      expect(OwnershipPolicy.ownsResource(actor, resource)).toBe(false);
    });
  });

  describe("assertCanAccessResource / assertCanModifyResource", () => {
    it("succeeds silently (ownership-policy success) when the actor owns the resource", () => {
      const actor: ActorScope = { userId: "u1", customerId: "cust-1" };
      const resource: ResourceOwnership = { customerId: "cust-1" };
      expect(() => OwnershipPolicy.assertCanAccessResource(actor, resource)).not.toThrow();
      expect(() => OwnershipPolicy.assertCanModifyResource(actor, resource)).not.toThrow();
    });

    it("throws a generic ForbiddenException (ownership-policy denial) that never names the other tenant", () => {
      const actor: ActorScope = { userId: "u1", customerId: "cust-1" };
      const resource: ResourceOwnership = { customerId: "cust-2" };
      try {
        OwnershipPolicy.assertCanAccessResource(actor, resource);
        throw new Error("expected assertCanAccessResource to throw");
      } catch (error) {
        expect(error).toBeInstanceOf(ForbiddenException);
        expect((error as ForbiddenException).message).not.toContain("cust-2");
        expect((error as ForbiddenException).message).not.toContain("cust-1");
      }
    });

    it("allows an explicit administrative override role to bypass ownership entirely", () => {
      const actor: ActorScope = { userId: "u1", customerId: "cust-1" };
      const resource: ResourceOwnership = { customerId: "cust-2" };
      expect(() =>
        OwnershipPolicy.assertCanAccessResource(actor, resource, { overrideRoles: ["ADMIN"], actorRoles: ["ADMIN"] }),
      ).not.toThrow();
    });

    it("does not apply an override role the actor does not actually hold", () => {
      const actor: ActorScope = { userId: "u1", customerId: "cust-1" };
      const resource: ResourceOwnership = { customerId: "cust-2" };
      expect(() =>
        OwnershipPolicy.assertCanAccessResource(actor, resource, { overrideRoles: ["ADMIN"], actorRoles: ["CUSTOMER"] }),
      ).toThrow(ForbiddenException);
    });
  });
});
