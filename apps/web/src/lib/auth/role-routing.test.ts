import { describe, expect, it } from "vitest";
import { hasAdministrativeRole, resolveLandingPath } from "./role-routing";

describe("resolveLandingPath", () => {
  it("sends SUPER_ADMIN to /admin", () => {
    expect(resolveLandingPath(["SUPER_ADMIN"])).toBe("/admin");
  });

  it("sends ADMIN to /admin", () => {
    expect(resolveLandingPath(["ADMIN"])).toBe("/admin");
  });

  it.each(["FINANCE", "COMMERCIAL", "CUSTOMER_SERVICE", "AUDITOR"])("sends internal role %s to /admin", (role) => {
    expect(resolveLandingPath([role])).toBe("/admin");
  });

  it("does not route legacy external roles into self-service portals", () => {
    expect(resolveLandingPath(["COMPANY_PARTNER"])).toBe("/");
    expect(resolveLandingPath(["CUSTOMER"])).toBe("/");
    expect(resolveLandingPath(["AFFILIATE"])).toBe("/");
    expect(hasAdministrativeRole(["AFFILIATE"])).toBe(false);
  });

  it("uses one deterministic internal priority when a user holds multiple roles", () => {
    expect(resolveLandingPath(["CUSTOMER", "ADMIN"])).toBe("/admin");
    expect(resolveLandingPath(["COMPANY_PARTNER", "SUPER_ADMIN"])).toBe("/admin");
    expect(resolveLandingPath(["AFFILIATE", "COMPANY_PARTNER"])).toBe("/");
  });

  it("falls back to the public home for unknown or empty roles", () => {
    expect(resolveLandingPath([])).toBe("/");
    expect(resolveLandingPath(["SOME_UNKNOWN_ROLE"])).toBe("/");
  });

  it("is stable and repeatable for the same input (deterministic)", () => {
    const roles = ["AFFILIATE", "CUSTOMER"];
    expect(resolveLandingPath(roles)).toBe(resolveLandingPath(roles));
  });
});
