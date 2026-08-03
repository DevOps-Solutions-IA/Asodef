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

  it("withholds the four platform-governance permissions from ADMIN", () => {
    const platformOnly = ["roles.manage", "permissions.manage", "settings.manage", "approvals.manage"];
    for (const key of platformOnly) {
      expect(ROLE_PERMISSIONS.ADMIN).not.toContain(key);
    }
    // but ADMIN still has everything else
    expect(ROLE_PERMISSIONS.ADMIN.length).toBe(PERMISSION_CATALOG.length - platformOnly.length);
  });
});
