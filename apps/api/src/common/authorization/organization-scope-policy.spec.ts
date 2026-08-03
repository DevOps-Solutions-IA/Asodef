import { ForbiddenException } from "@nestjs/common";
import { OrganizationScopePolicy } from "./organization-scope-policy";

describe("OrganizationScopePolicy", () => {
  it("treats matching, non-empty organization ids as the same organization (organization-scope success)", () => {
    expect(OrganizationScopePolicy.isSameOrganization("org-1", "org-1")).toBe(true);
    expect(() => OrganizationScopePolicy.assertSameOrganization("org-1", "org-1")).not.toThrow();
  });

  it("denies access across different organizations (organization-scope denial)", () => {
    expect(OrganizationScopePolicy.isSameOrganization("org-1", "org-2")).toBe(false);
    expect(() => OrganizationScopePolicy.assertSameOrganization("org-1", "org-2")).toThrow(ForbiddenException);
  });

  it("never treats two null/undefined organization ids as a match (fails closed)", () => {
    expect(OrganizationScopePolicy.isSameOrganization(null, null)).toBe(false);
    expect(OrganizationScopePolicy.isSameOrganization(undefined, undefined)).toBe(false);
    expect(() => OrganizationScopePolicy.assertSameOrganization(null, undefined)).toThrow(ForbiddenException);
  });

  it("never names either organization id in the thrown error", () => {
    try {
      OrganizationScopePolicy.assertSameOrganization("org-secret-1", "org-secret-2");
      throw new Error("expected assertSameOrganization to throw");
    } catch (error) {
      expect((error as ForbiddenException).message).not.toContain("org-secret-1");
      expect((error as ForbiddenException).message).not.toContain("org-secret-2");
    }
  });
});
