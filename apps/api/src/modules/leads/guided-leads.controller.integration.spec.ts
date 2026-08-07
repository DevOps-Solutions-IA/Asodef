import { randomUUID } from "node:crypto";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import type { PrismaClient } from "@prisma/client";
import request from "supertest";
import { AppModule } from "../../app.module";
import { configureApp } from "../../bootstrap-app";
import { RedisService } from "../../common/redis/redis.service";
import { PrismaService } from "../../database/prisma.service";
import { publishDraftForTest, type PublishedForTestHandle } from "../../database/publish-legal-document-for-test";

describe("guided public funnel", () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  const keys: string[] = [];
  const legalHandles: PublishedForTestHandle[] = [];

  beforeAll(async () => {
    app = await NestFactory.create<NestExpressApplication>(AppModule, { logger: false });
    configureApp(app); await app.init(); prisma = app.get(PrismaService);
    for (const slug of [
      "tratamiento-de-datos",
      "consentimiento-comunicaciones-comerciales",
      "consentimiento-correo-electronico",
      "consentimiento-whatsapp",
    ]) {
      const handle = await publishDraftForTest(prisma as unknown as PrismaClient, slug);
      if (!handle) throw new Error(`The guided-lead integration fixture could not publish ${slug}.`);
      legalHandles.push(handle);
    }
    const redis = app.get(RedisService).getClient();
    const rateKeys = await redis.keys("ratelimit:guided-leads:*");
    if (rateKeys.length) await redis.del(...rateKeys);
  });

  afterAll(async () => {
    try {
      const leads = await prisma.leadSubmission.findMany({ where: { idempotencyKey: { in: keys } }, select: { id: true } });
      await prisma.consentRecord.deleteMany({ where: { leadSubmissionId: { in: leads.map(item => item.id) } } });
      await prisma.leadSubmission.deleteMany({ where: { idempotencyKey: { in: keys } } });
    } finally {
      for (const handle of legalHandles.reverse()) await handle.restore();
      await app.close();
    }
  });

  function payload(overrides: Record<string, unknown> = {}) {
    const idempotencyKey = randomUUID(); keys.push(idempotencyKey);
    return { audience: "company", need: "Beneficios para colaboradores", fullName: "Responsable de prueba", email: `guided-${randomUUID()}@example.com`, phone: "3001234567", company: "Organización de prueba", role: "Gestión humana", city: "Cali", message: "Solicito orientación sobre la ruta empresarial disponible.", preferredContact: "email", dataProcessingConsent: true, emailConsent: true, commercialConsent: true, idempotencyKey, entryRoute: "/comenzar?utm_source=prueba", campaign: { utmSource: "prueba", utmCampaign: "qa-local" }, ...overrides };
  }

  it("atomically creates a classified CRM lead and exact-version consent evidence", async () => {
    const body = payload();
    const response = await request(app.getHttpServer()).post("/api/v1/leads/guided").send(body).expect(201);
    expect(response.body).toMatchObject({ status: "received" });
    expect(response.body.reference).toMatch(/^ASO-[A-F0-9]{10}$/);
    const lead = await prisma.leadSubmission.findUniqueOrThrow({ where: { idempotencyKey: body.idempotencyKey as string } });
    expect(lead).toMatchObject({ source: "guided_public_funnel", audience: "company", need: body.need, publicReference: response.body.reference });
    expect(lead.campaign).toMatchObject({ utmSource: "prueba", utmCampaign: "qa-local" });
    const records = await prisma.consentRecord.findMany({ where: { leadSubmissionId: lead.id }, include: { consentPurpose: true, legalDocumentVersion: { include: { legalDocument: true } } } });
    expect(records.map(record => record.consentPurpose.key)).toEqual(expect.arrayContaining(["data_processing", "commercial_communications", "electronic_notifications"]));
    expect(records.every(record => record.legalDocumentVersion?.status === "PUBLISHED")).toBe(true);
    expect(records.find(record => record.consentPurpose.key === "electronic_notifications")?.legalDocumentVersion?.legalDocument.slug).toBe("consentimiento-correo-electronico");
  });

  it("returns the same reference for an idempotent retry without duplicating records", async () => {
    const body = payload();
    const first = await request(app.getHttpServer()).post("/api/v1/leads/guided").send(body).expect(201);
    const second = await request(app.getHttpServer()).post("/api/v1/leads/guided").send(body).expect(201);
    expect(second.body.reference).toBe(first.body.reference);
    expect(await prisma.leadSubmission.count({ where: { idempotencyKey: body.idempotencyKey as string } })).toBe(1);
  });

  it("rejects channel selection and organizational submissions missing required context", async () => {
    const noCompany = payload({ company: "" });
    await request(app.getHttpServer()).post("/api/v1/leads/guided").send(noCompany).expect(400);
    const noChannelConsent = payload({ preferredContact: "whatsapp", whatsappConsent: false });
    await request(app.getHttpServer()).post("/api/v1/leads/guided").send(noChannelConsent).expect(400);
  });
});
