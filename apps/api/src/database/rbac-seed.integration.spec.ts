import { PrismaClient } from "@prisma/client";
import { createTestPrismaClient } from "./test-db-client";
import { PERMISSION_CATALOG, ROLE_CATALOG, ROLE_PERMISSIONS } from "./rbac-catalog";
import { seedRbac } from "./seed-rbac";

describe("RBAC seed (integration, real Postgres)", () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    prisma = createTestPrismaClient();
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("is idempotent: running the seed twice does not change row counts or duplicate associations", async () => {
    await seedRbac(prisma);
    const [permissionsAfterFirst, rolesAfterFirst, rolePermissionsAfterFirst] = await Promise.all([
      prisma.permission.count(),
      prisma.role.count(),
      prisma.rolePermission.count(),
    ]);

    await seedRbac(prisma);
    const [permissionsAfterSecond, rolesAfterSecond, rolePermissionsAfterSecond] = await Promise.all([
      prisma.permission.count(),
      prisma.role.count(),
      prisma.rolePermission.count(),
    ]);

    expect(permissionsAfterSecond).toBe(permissionsAfterFirst);
    expect(rolesAfterSecond).toBe(rolesAfterFirst);
    expect(rolePermissionsAfterSecond).toBe(rolePermissionsAfterFirst);
  });

  it("creates exactly the catalog's roles and permissions, no more, no fewer", async () => {
    await seedRbac(prisma);

    const permissionCount = await prisma.permission.count();
    const roleCount = await prisma.role.count();
    expect(permissionCount).toBe(PERMISSION_CATALOG.length);
    expect(roleCount).toBe(ROLE_CATALOG.length);
  });

  it("attaches to SUPER_ADMIN exactly the full permission set, queryable through the real relations", async () => {
    await seedRbac(prisma);

    const superAdmin = await prisma.role.findUniqueOrThrow({
      where: { name: "SUPER_ADMIN" },
      include: { permissions: { include: { permission: true } } },
    });

    const attachedKeys = superAdmin.permissions.map((rp) => rp.permission.key).sort();
    const expectedKeys = [...ROLE_PERMISSIONS.SUPER_ADMIN].sort();
    expect(attachedKeys).toEqual(expectedKeys);
  });

  it("attaches to CUSTOMER exactly its single, minimal permission", async () => {
    await seedRbac(prisma);

    const customer = await prisma.role.findUniqueOrThrow({
      where: { name: "CUSTOMER" },
      include: { permissions: { include: { permission: true } } },
    });

    expect(customer.permissions.map((rp) => rp.permission.key)).toEqual(["payments.read"]);
  });

  it("persists the exact Bingo operator and supervisor capability boundaries", async () => {
    await seedRbac(prisma);

    const roles = await prisma.role.findMany({
      where: { name: { in: ["BINGO_OPERATOR", "BINGO_SUPERVISOR"] } },
      include: { permissions: { include: { permission: true } } },
    });
    const keysByRole = new Map(
      roles.map((role) => [role.name, role.permissions.map(({ permission }) => permission.key).sort()]),
    );

    expect(keysByRole.get("BINGO_OPERATOR")).toEqual([...ROLE_PERMISSIONS.BINGO_OPERATOR].sort());
    expect(keysByRole.get("BINGO_SUPERVISOR")).toEqual([...ROLE_PERMISSIONS.BINGO_SUPERVISOR].sort());
  });

  it("adds Bingo capabilities without changing any pre-existing role mapping", async () => {
    await seedRbac(prisma);

    const preExistingRoleNames = [
      "FINANCE",
      "COMMERCIAL",
      "CUSTOMER_SERVICE",
      "COMPANY_PARTNER",
      "AFFILIATE",
      "CUSTOMER",
      "AUDITOR",
    ] as const;
    const roles = await prisma.role.findMany({
      where: { name: { in: [...preExistingRoleNames] } },
      include: { permissions: { include: { permission: true } } },
    });

    for (const role of roles) {
      const expected = [...ROLE_PERMISSIONS[role.name as (typeof preExistingRoleNames)[number]]].sort();
      expect(role.permissions.map(({ permission }) => permission.key).sort()).toEqual(expected);
      expect(expected.some((key) => key.startsWith("bingo."))).toBe(false);
    }
  });
});
