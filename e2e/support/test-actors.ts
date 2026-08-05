// US-066/US-067: real, logged-in actors are needed to prove role-gated
// flows are actually blocked/allowed (not just unreachable because no
// one is logged in), and for US-067's own manual verification pass
// (CRM pipeline, legal document approval/publication, approval-gate
// review - all internal-staff-only actions). seed-rbac.ts deliberately
// creates zero User rows ("a default production user with a known
// password is a real security liability"), so there is no seeded staff
// account to reuse - this provisions them directly against the same
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

export const TEST_ACTOR_PASSWORD = "e2e-test-password-123";

export const CUSTOMER_SERVICE_TEST_EMAIL = "e2e.customer-service@example.com";
/** @deprecated kept for the US-066 admin-access negative case's own
 * naming - use TEST_ACTOR_PASSWORD directly in new code. */
export const CUSTOMER_SERVICE_TEST_PASSWORD = TEST_ACTOR_PASSWORD;

/** Idempotent - safe to call at the start of every run without
 * accumulating duplicate rows (upsert by email, upsert the role link). */
export async function ensureTestActor(email: string, fullName: string, roleName: string): Promise<void> {
  const passwordHash = await argon2.hash(TEST_ACTOR_PASSWORD, { type: argon2.argon2id });

  const user = await prisma.user.upsert({
    where: { email },
    update: { passwordHash, status: "ACTIVE" },
    create: { email, passwordHash, fullName, status: "ACTIVE" },
  });

  const role = await prisma.role.findUniqueOrThrow({ where: { name: roleName } });
  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: user.id, roleId: role.id } },
    create: { userId: user.id, roleId: role.id },
    update: {},
  });
}

export async function ensureCustomerServiceActor(): Promise<void> {
  await ensureTestActor(CUSTOMER_SERVICE_TEST_EMAIL, "E2E Customer Service", "CUSTOMER_SERVICE");
}

export async function disconnectTestActorsClient(): Promise<void> {
  await prisma.$disconnect();
}
