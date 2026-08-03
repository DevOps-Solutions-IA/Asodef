import { PrismaClient } from "@prisma/client";
import { PERMISSION_CATALOG, ROLE_CATALOG, ROLE_PERMISSIONS } from "./rbac-catalog";

/**
 * Seeds only roles, permissions, and their associations. Deliberately
 * creates zero User rows - a default production user with a known
 * password is a real security liability, not a convenience.
 */
export async function seedRbac(client: PrismaClient): Promise<void> {
  for (const permission of PERMISSION_CATALOG) {
    await client.permission.upsert({
      where: { key: permission.key },
      update: { description: permission.description },
      create: permission,
    });
  }

  for (const role of ROLE_CATALOG) {
    await client.role.upsert({
      where: { name: role.name },
      update: { description: role.description },
      create: role,
    });
  }

  const allPermissions = await client.permission.findMany();
  const permissionIdByKey = new Map(allPermissions.map((p) => [p.key, p.id]));

  const allRoles = await client.role.findMany();
  const roleIdByName = new Map(allRoles.map((r) => [r.name, r.id]));

  for (const [roleName, permissionKeys] of Object.entries(ROLE_PERMISSIONS)) {
    const roleId = roleIdByName.get(roleName);
    if (!roleId) {
      throw new Error(`Seed error: role "${roleName}" was not created before assigning its permissions`);
    }

    const rolePermissionRows = permissionKeys.map((key) => {
      const permissionId = permissionIdByKey.get(key);
      if (!permissionId) {
        throw new Error(`Seed error: permission "${key}" referenced by role "${roleName}" does not exist`);
      }
      return { roleId, permissionId };
    });

    await client.rolePermission.createMany({
      data: rolePermissionRows,
      skipDuplicates: true,
    });
  }
}
