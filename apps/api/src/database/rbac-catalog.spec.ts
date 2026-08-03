import { PERMISSION_CATALOG, ROLE_CATALOG, ROLE_PERMISSIONS } from "./rbac-catalog";

describe("RBAC catalog data integrity", () => {
  const permissionKeys = new Set(PERMISSION_CATALOG.map((p) => p.key));
  const roleNames = new Set(ROLE_CATALOG.map((r) => r.name));

  it("has no duplicate permission keys", () => {
    expect(permissionKeys.size).toBe(PERMISSION_CATALOG.length);
  });

  it("has no duplicate role names", () => {
    expect(roleNames.size).toBe(ROLE_CATALOG.length);
  });

  it("seeds exactly the 9 roles required by the PRD", () => {
    expect(roleNames).toEqual(
      new Set([
        "SUPER_ADMIN",
        "ADMIN",
        "FINANCE",
        "COMMERCIAL",
        "CUSTOMER_SERVICE",
        "COMPANY_PARTNER",
        "AFFILIATE",
        "CUSTOMER",
        "AUDITOR",
      ]),
    );
  });

  it("only maps roles to permission keys that actually exist in the catalog", () => {
    for (const [roleName, keys] of Object.entries(ROLE_PERMISSIONS)) {
      for (const key of keys) {
        expect(permissionKeys.has(key)).toBe(true);
      }
      // and no role lists the same permission twice
      expect(new Set(keys).size).toBe(keys.length);
      void roleName;
    }
  });

  it("defines a ROLE_PERMISSIONS entry for every seeded role", () => {
    for (const role of ROLE_CATALOG) {
      expect(ROLE_PERMISSIONS[role.name]).toBeDefined();
    }
  });

  it("grants SUPER_ADMIN every permission in the catalog", () => {
    expect(new Set(ROLE_PERMISSIONS.SUPER_ADMIN)).toEqual(permissionKeys);
  });

  it("withholds the five platform-governance permissions from ADMIN (US-008: legal.approve joined this set)", () => {
    const platformOnly = ["roles.manage", "permissions.manage", "settings.manage", "approvals.manage", "legal.approve"];
    for (const key of platformOnly) {
      expect(ROLE_PERMISSIONS.ADMIN).not.toContain(key);
    }
    // but ADMIN still has everything else
    expect(ROLE_PERMISSIONS.ADMIN.length).toBe(PERMISSION_CATALOG.length - platformOnly.length);
  });

  describe("US-008 governance matrix rules", () => {
    const GOVERNANCE_KEYS = ["roles.manage", "permissions.manage", "settings.manage", "approvals.manage", "legal.approve"];
    const nonSuperAdminRoles = ROLE_CATALOG.map((r) => r.name).filter((name) => name !== "SUPER_ADMIN");

    it("grants every governance permission to SUPER_ADMIN", () => {
      for (const key of GOVERNANCE_KEYS) {
        expect(ROLE_PERMISSIONS.SUPER_ADMIN).toContain(key);
      }
    });

    it("grants no governance permission to any role other than SUPER_ADMIN", () => {
      for (const roleName of nonSuperAdminRoles) {
        for (const key of GOVERNANCE_KEYS) {
          expect(ROLE_PERMISSIONS[roleName]).not.toContain(key);
        }
      }
    });

    it("keeps AUDITOR strictly read-only (no manage/create/update/refund/approve permission)", () => {
      const mutatingSuffixes = [".manage", ".create", ".update", ".refund", ".approve"];
      for (const key of ROLE_PERMISSIONS.AUDITOR) {
        expect(mutatingSuffixes.some((suffix) => key.endsWith(suffix))).toBe(false);
      }
    });

    it("denies CUSTOMER any broad cross-customer read/manage permission", () => {
      expect(ROLE_PERMISSIONS.CUSTOMER).not.toContain("customers.read");
      expect(ROLE_PERMISSIONS.CUSTOMER).not.toContain("customers.update");
      expect(ROLE_PERMISSIONS.CUSTOMER).not.toContain("customers.create");
    });

    it("denies AFFILIATE any broad cross-affiliate read/manage permission", () => {
      expect(ROLE_PERMISSIONS.AFFILIATE).not.toContain("affiliates.read");
      expect(ROLE_PERMISSIONS.AFFILIATE).not.toContain("affiliates.manage");
    });

    it("denies COMPANY_PARTNER any cross-company management permission", () => {
      expect(ROLE_PERMISSIONS.COMPANY_PARTNER).not.toContain("companies.manage");
    });

    it("limits FINANCE to financial/reporting/audit permissions only (no governance, no CRM/company management)", () => {
      const allowedPrefixes = ["payments.", "reports.", "audit."];
      for (const key of ROLE_PERMISSIONS.FINANCE) {
        expect(allowedPrefixes.some((prefix) => key.startsWith(prefix))).toBe(true);
      }
    });

    it("denies COMMERCIAL any financial or governance permission", () => {
      for (const key of ROLE_PERMISSIONS.COMMERCIAL) {
        expect(key.startsWith("payments.")).toBe(false);
        expect(GOVERNANCE_KEYS).not.toContain(key);
      }
    });

    it("denies CUSTOMER_SERVICE refunds, legal/policy approval, and permission management", () => {
      expect(ROLE_PERMISSIONS.CUSTOMER_SERVICE).not.toContain("payments.refund");
      expect(ROLE_PERMISSIONS.CUSTOMER_SERVICE).not.toContain("legal.approve");
      expect(ROLE_PERMISSIONS.CUSTOMER_SERVICE).not.toContain("approvals.manage");
      expect(ROLE_PERMISSIONS.CUSTOMER_SERVICE).not.toContain("permissions.manage");
      expect(ROLE_PERMISSIONS.CUSTOMER_SERVICE).not.toContain("roles.manage");
    });
  });
});
