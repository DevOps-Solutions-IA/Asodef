import { PrismaClient } from "@prisma/client";
import { createTestPrismaClient } from "./test-db-client";
import { CONTENT_CATALOG } from "./content-catalog";
import { seedContent } from "./seed-content";

describe("Content seed (integration, real Postgres)", () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    prisma = createTestPrismaClient();
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("is idempotent: running the seed twice does not change row counts or values", async () => {
    await seedContent(prisma);
    const afterFirst = await prisma.contentEntry.findMany({ orderBy: { key: "asc" } });

    await seedContent(prisma);
    const afterSecond = await prisma.contentEntry.findMany({ orderBy: { key: "asc" } });

    expect(afterSecond).toHaveLength(afterFirst.length);
    expect(afterSecond.map((e) => ({ key: e.key, value: e.value, status: e.status }))).toEqual(
      afterFirst.map((e) => ({ key: e.key, value: e.value, status: e.status })),
    );
  });

  it("creates exactly the catalog's entries, all published, no more no fewer", async () => {
    await seedContent(prisma);

    const entries = await prisma.contentEntry.findMany();
    expect(entries).toHaveLength(CONTENT_CATALOG.length);
    for (const entry of entries) {
      expect(entry.status).toBe("PUBLISHED");
    }
  });

  it("seeds the exact approved hero.eyebrow value", async () => {
    await seedContent(prisma);

    const heroEyebrow = await prisma.contentEntry.findUniqueOrThrow({ where: { key: "hero.eyebrow" } });
    expect(heroEyebrow.value).toBe("ASODEF · Asociación para el desarrollo familiar");
    expect(heroEyebrow.status).toBe("PUBLISHED");
  });

  it("never seeds a US-014-deferred statistic key", async () => {
    await seedContent(prisma);

    for (const key of ["stats.affiliates", "stats.beneficiaries", "stats.experienceYears"]) {
      const entry = await prisma.contentEntry.findUnique({ where: { key } });
      expect(entry).toBeNull();
    }
  });
});
