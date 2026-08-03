import { PrismaClient } from "@prisma/client";

/**
 * Not a test itself (no .spec.ts suffix, so Jest ignores it) - a shared
 * helper for the integration specs in this directory. Falls back to the
 * same local docker-compose Postgres used in development so `pnpm test`
 * works out of the box without extra setup, while still respecting an
 * explicit DATABASE_URL override (e.g. in CI).
 */
const FALLBACK_TEST_DATABASE_URL = "postgresql://asodef:asodef_dev_password@localhost:5433/asodef?schema=public";

export function createTestPrismaClient(): PrismaClient {
  return new PrismaClient({
    datasources: {
      db: {
        url: process.env.DATABASE_URL ?? FALLBACK_TEST_DATABASE_URL,
      },
    },
  });
}
