import type { PrismaClient } from "@prisma/client";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import request from "supertest";
import { AppModule } from "../../app.module";
import { configureApp } from "../../bootstrap-app";
import { PrismaService } from "../../database/prisma.service";
import { publishDraftForTest, type PublishedForTestHandle } from "../../database/publish-legal-document-for-test";

describe("Cookie consent endpoint (integration, real HTTP via the exact configureApp() setup)", () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let cookiesHandle: PublishedForTestHandle | null = null;
  let preservedConsentIds: string[] = [];

  beforeAll(async () => {
    app = await NestFactory.create<NestExpressApplication>(AppModule, { logger: false });
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);

    // US-047: cookie_preferences consent requires a resolvable, currently
    // PUBLISHED politica-de-cookies version - see publishDraftForTest's
    // own doc comment (test-only, reverted in afterAll).
    cookiesHandle = await publishDraftForTest(prisma as unknown as PrismaClient, "politica-de-cookies");
    preservedConsentIds = (await prisma.consentRecord.findMany({ where: { source: "cookie_banner" }, select: { id: true } })).map((record) => record.id);
  });

  afterAll(async () => {
    if (cookiesHandle) {
      await prisma.consentRecord.deleteMany({ where: { source: "cookie_banner", id: { notIn: preservedConsentIds } } });
      await cookiesHandle.restore();
    }
    await app.close();
  });

  async function findRecordedCategories() {
    const purpose = await prisma.consentPurpose.findUniqueOrThrow({ where: { key: "cookie_preferences" } });
    return prisma.consentRecord.findMany({
      where: { consentPurposeId: purpose.id, legalDocumentVersionId: cookiesHandle?.versionId },
      orderBy: { createdAt: "desc" },
      take: 3,
    });
  }

  it("Example (AC): 'Aceptar todas' persists GRANTED for all 3 optional categories", async () => {
    const response = await request(app.getHttpServer())
      .post("/api/v1/cookie-consent")
      .send({ preferences: true, analytics: true, marketing: true, method: "accept_all" });

    expect(response.status).toBe(204);

    const records = await findRecordedCategories();
    expect(records).toHaveLength(3);
    const byCategory = Object.fromEntries(records.map((r) => [(r.metadata as { category: string }).category, r.status]));
    expect(byCategory).toEqual({ preferences: "GRANTED", analytics: "GRANTED", marketing: "GRANTED" });
    for (const record of records) {
      expect(record.legalDocumentVersionId).toBe(cookiesHandle?.versionId);
      expect(record.acceptanceMethod).toBe("accept_all");
      expect(record.userId).toBeNull();
      expect(record.leadSubmissionId).toBeNull();
      expect(record.customerId).toBeNull();
    }
  });

  it("Negative case (AC): 'Rechazar opcionales' persists DENIED for preferences/analytics/marketing", async () => {
    const response = await request(app.getHttpServer())
      .post("/api/v1/cookie-consent")
      .send({ preferences: false, analytics: false, marketing: false, method: "reject_optional" });

    expect(response.status).toBe(204);

    const records = await findRecordedCategories();
    const byCategory = Object.fromEntries(records.map((r) => [(r.metadata as { category: string }).category, r.status]));
    expect(byCategory).toEqual({ preferences: "DENIED", analytics: "DENIED", marketing: "DENIED" });
  });

  it("'Personalizar' persists a mixed grant/deny per category", async () => {
    const response = await request(app.getHttpServer())
      .post("/api/v1/cookie-consent")
      .send({ preferences: true, analytics: false, marketing: false, method: "customize" });

    expect(response.status).toBe(204);

    const records = await findRecordedCategories();
    const byCategory = Object.fromEntries(records.map((r) => [(r.metadata as { category: string }).category, r.status]));
    expect(byCategory).toEqual({ preferences: "GRANTED", analytics: "DENIED", marketing: "DENIED" });
  });

  it("does not require authentication (public endpoint)", async () => {
    const response = await request(app.getHttpServer())
      .post("/api/v1/cookie-consent")
      .send({ preferences: true, analytics: true, marketing: true, method: "accept_all" });
    expect(response.status).toBe(204);
  });

  it("rejects a malformed method with 400", async () => {
    const response = await request(app.getHttpServer())
      .post("/api/v1/cookie-consent")
      .send({ preferences: true, analytics: true, marketing: true, method: "not_a_real_method" });
    expect(response.status).toBe(400);
  });

  it("BLOCKED BY APPROVED LEGAL CONTENT: without a published politica-de-cookies version, returns 400 and creates no records", async () => {
    if (!cookiesHandle) return;

    const purpose = await prisma.consentPurpose.findUniqueOrThrow({ where: { key: "cookie_preferences" } });
    const countBefore = await prisma.consentRecord.count({
      where: { consentPurposeId: purpose.id, legalDocumentVersionId: cookiesHandle.versionId },
    });

    await cookiesHandle.unpublish();
    try {
      const response = await request(app.getHttpServer())
        .post("/api/v1/cookie-consent")
        .send({ preferences: true, analytics: true, marketing: true, method: "accept_all" });

      expect(response.status).toBe(400);
      expect(response.body.message).not.toMatch(/politica-de-cookies|slug|uuid|constraint/i);

      const countAfter = await prisma.consentRecord.count({
        where: { consentPurposeId: purpose.id, legalDocumentVersionId: cookiesHandle.versionId },
      });
      expect(countAfter).toBe(countBefore);
    } finally {
      await cookiesHandle.republish();
    }
  });
});
