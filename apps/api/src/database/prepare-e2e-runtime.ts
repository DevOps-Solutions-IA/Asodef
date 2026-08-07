import { randomBytes } from "node:crypto";
import * as argon2 from "argon2";
import { PrismaClient } from "@prisma/client";
import { publishLegalCorrections } from "./publish-legal-corrections";

const E2E_PUBLISHER_EMAIL = "ci.legal-publisher@example.invalid";

export function assertSafeE2EPreparation(environment: NodeJS.ProcessEnv): void {
  if (environment.NODE_ENV === "production") {
    throw new Error("E2E runtime preparation is forbidden in production.");
  }
  if (environment.CI !== "true" && environment.ASODEF_E2E_PREPARE !== "true") {
    throw new Error("E2E runtime preparation requires CI=true or ASODEF_E2E_PREPARE=true.");
  }

  const databaseUrl = environment.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required for E2E runtime preparation.");
  const hostname = new URL(databaseUrl).hostname;
  if (hostname !== "localhost" && hostname !== "127.0.0.1") {
    throw new Error("E2E runtime preparation is restricted to a local isolated database.");
  }
}

export async function prepareE2ERuntime(environment: NodeJS.ProcessEnv = process.env): Promise<number> {
  assertSafeE2EPreparation(environment);
  const prisma = new PrismaClient({ datasourceUrl: environment.DATABASE_URL });
  try {
    const role = await prisma.role.findUniqueOrThrow({ where: { name: "SUPER_ADMIN" } });
    const passwordHash = await argon2.hash(randomBytes(32), { type: argon2.argon2id });
    const actor = await prisma.user.upsert({
      where: { email: E2E_PUBLISHER_EMAIL },
      update: { passwordHash, status: "ACTIVE" },
      create: {
        email: E2E_PUBLISHER_EMAIL,
        fullName: "CI Legal Workflow Actor",
        passwordHash,
        status: "ACTIVE",
      },
    });
    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: actor.id, roleId: role.id } },
      create: { userId: actor.id, roleId: role.id },
      update: {},
    });
  } finally {
    await prisma.$disconnect();
  }

  const results = await publishLegalCorrections();
  const published = results.filter((result) => result.status === "PUBLISHED" && result.current).length;
  if (published !== 21) throw new Error(`Expected 21 published legal documents, received ${published}.`);
  return published;
}

if (require.main === module) {
  prepareE2ERuntime()
    .then((published) => process.stdout.write(`E2E runtime preparation complete: ${published} legal documents published.\n`))
    .catch((error: unknown) => {
      process.stderr.write(`E2E runtime preparation failed: ${error instanceof Error ? error.message : "unknown error"}\n`);
      process.exitCode = 1;
    });
}
