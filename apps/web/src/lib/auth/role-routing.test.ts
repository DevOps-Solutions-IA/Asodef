import { describe, expect, it } from "vitest";
import { resolveLandingPath } from "./role-routing";

describe("resolveLandingPath", () => {
  it("sends SUPER_ADMIN to /admin", () => {
    expect(resolveLandingPath(["SUPER_ADMIN"])).toBe("/admin");
  });

  it("sends ADMIN to /admin", () => {
    expect(resolveLandingPath(["ADMIN"])).toBe("/admin");
  });

  it("sends COMPANY_PARTNER to /empresa", () => {
    expect(resolveLandingPath(["COMPANY_PARTNER"])).toBe("/empresa");
  });

  it("sends CUSTOMER to /mi-cuenta", () => {
    expect(resolveLandingPath(["CUSTOMER"])).toBe("/mi-cuenta");
  });

  it("sends AFFILIATE to /mi-cuenta", () => {
    expect(resolveLandingPath(["AFFILIATE"])).toBe("/mi-cuenta");
  });

  it("falls back to /mi-cuenta for a user with no recognized roles", () => {
    expect(resolveLandingPath([])).toBe("/mi-cuenta");
    expect(resolveLandingPath(["SOME_UNKNOWN_ROLE"])).toBe("/mi-cuenta");
  });

  it("uses one deterministic priority when a user holds multiple roles - highest privilege wins", () => {
    expect(resolveLandingPath(["CUSTOMER", "ADMIN"])).toBe("/admin");
    expect(resolveLandingPath(["COMPANY_PARTNER", "SUPER_ADMIN"])).toBe("/admin");
    expect(resolveLandingPath(["AFFILIATE", "COMPANY_PARTNER"])).toBe("/empresa");
  });

  it("is stable and repeatable for the same input (deterministic)", () => {
    const roles = ["AFFILIATE", "CUSTOMER"];
    expect(resolveLandingPath(roles)).toBe(resolveLandingPath(roles));
  });
});
