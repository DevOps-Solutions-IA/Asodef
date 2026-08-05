// US-066: e2e negative case needs a real, logged-in CUSTOMER_SERVICE
// actor to prove /admin/usuarios is actually blocked for that role, not
// just unreachable because no one is logged in. seed-rbac.ts deliberately
// creates zero User rows ("a default production user with a known
// password is a real security liability"), so there is no seeded staff
// account to reuse - this provisions one directly against the same
// database the running API instance uses, mirroring the
// createUser()/assignRole() pattern apps/api's own integration tests
// already use (e.g. partners.controller.integration.spec.ts), just from
// outside the NestJS process since Playwright runs as a separate one.
// @prisma/client and argon2 are root devDependencies specifically so
// this resolves cleanly (matching apps/api's exact pinned versions via
// the pnpm workspace) rather than reaching into another workspace's
// node_modules by relative path.
import { PrismaClient } from "@prisma/client";
import * as argon2 from "argon2";

const prisma = new PrismaClient();

export const CUSTOMER_SERVICE_TEST_EMAIL = "e2e.customer-service@example.com";
export const CUSTOMER_SERVICE_TEST_PASSWORD = "e2e-test-password-123";

/** Idempotent - safe to call at the start of every test run without
 * accumulating duplicate rows (upsert by email, upsert the role link). */
export async function ensureCustomerServiceActor(): Promise<void> {
  const passwordHash = await argon2.hash(CUSTOMER_SERVICE_TEST_PASSWORD, { type: argon2.argon2id });

  const user = await prisma.user.upsert({
    where: { email: CUSTOMER_SERVICE_TEST_EMAIL },
    update: { passwordHash, status: "ACTIVE" },
    create: {
      email: CUSTOMER_SERVICE_TEST_EMAIL,
      passwordHash,
      fullName: "E2E Customer Service",
      status: "ACTIVE",
    },
  });

  const role = await prisma.role.findUniqueOrThrow({ where: { name: "CUSTOMER_SERVICE" } });
  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: user.id, roleId: role.id } },
    create: { userId: user.id, roleId: role.id },
    update: {},
  });
}

export async function disconnectTestActorsClient(): Promise<void> {
  await prisma.$disconnect();
}
