import { randomUUID } from "node:crypto";
import { NestFactory } from "@nestjs/core";
import { ConfigService } from "@nestjs/config";
import type { NestExpressApplication } from "@nestjs/platform-express";
import request from "supertest";
import { AppModule } from "../../app.module";
import { configureApp } from "../../bootstrap-app";
import { PrismaService } from "../../database/prisma.service";
import { RedisService } from "../../common/redis/redis.service";
import type { EnvConfig } from "../../config/env.validation";

function validLeadPayload(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    nombreCompleto: "Visitante de Prueba",
    empresa: "Empresa de Prueba S.A.S.",
    cargo: "Gerente Comercial",
    ciudad: "Cali",
    telefono: "3001234567",
    correo: `lead-${randomUUID()}@example.com`,
    sector: "Servicios",
    mensaje: "Quiero conocer más sobre ser aliado de ASODEF.",
    consentAccepted: true,
    ...overrides,
  };
}

describe("Leads endpoints (integration, real HTTP via the exact configureApp() setup)", () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  const createdEmails: string[] = [];

  beforeAll(async () => {
    app = await NestFactory.create<NestExpressApplication>(AppModule, { logger: false });
    configureApp(app);
    await app.init();

    prisma = app.get(PrismaService);

    // Same non-disruptive cleanup convention as
    // password-recovery.controller.integration.spec.ts: clear only this
    // file's own rate-limit key pattern, never a broad FLUSHALL, so
    // repeated runs of this file don't shadow later tests with a false
    // rate-limit hit from a prior run's accumulated counter.
    const redisClient = app.get(RedisService).getClient();
    const keysToClear = await redisClient.keys("ratelimit:leads:*");
    if (keysToClear.length > 0) {
      await redisClient.del(...keysToClear);
    }
  });

  afterAll(async () => {
    if (createdEmails.length > 0) {
      await prisma.leadSubmission.deleteMany({ where: { email: { in: createdEmails } } });
    }
    await app.close();
  });

  it("persists a well-formed submission and returns 201 with public-safe fields, no internal id", async () => {
    const payload = validLeadPayload();
    createdEmails.push(payload.correo);

    const response = await request(app.getHttpServer()).post("/api/v1/leads").send(payload);

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      nombreCompleto: payload.nombreCompleto,
      empresa: payload.empresa,
      cargo: payload.cargo,
      ciudad: payload.ciudad,
      telefono: payload.telefono,
      correo: payload.correo,
      sector: payload.sector,
      mensaje: payload.mensaje,
      consentAccepted: true,
    });
    expect(response.body).not.toHaveProperty("id");
    expect(response.body).not.toHaveProperty("website");

    const persisted = await prisma.leadSubmission.findFirst({ where: { email: payload.correo } });
    expect(persisted).not.toBeNull();
    expect(persisted?.status).toBe("PENDING");
  });

  it("creates a pending LeadNotification stub for every persisted submission", async () => {
    const payload = validLeadPayload();
    createdEmails.push(payload.correo);

    await request(app.getHttpServer()).post("/api/v1/leads").send(payload).expect(201);

    const lead = await prisma.leadSubmission.findFirstOrThrow({ where: { email: payload.correo } });
    const notification = await prisma.leadNotification.findUnique({ where: { leadSubmissionId: lead.id } });
    expect(notification).not.toBeNull();
    expect(notification?.status).toBe("PENDING");
  });

  it("rejects a submission missing consentAccepted with 400 and does not persist it", async () => {
    const payload = validLeadPayload({ consentAccepted: undefined });

    const response = await request(app.getHttpServer()).post("/api/v1/leads").send(payload);

    expect(response.status).toBe(400);
    const persisted = await prisma.leadSubmission.findFirst({ where: { email: payload.correo } });
    expect(persisted).toBeNull();
  });

  it("rejects a submission with consentAccepted=false with 400 and does not persist it", async () => {
    const payload = validLeadPayload({ consentAccepted: false });

    const response = await request(app.getHttpServer()).post("/api/v1/leads").send(payload);

    expect(response.status).toBe(400);
    const persisted = await prisma.leadSubmission.findFirst({ where: { email: payload.correo } });
    expect(persisted).toBeNull();
  });

  it("rejects a submission missing a required field (correo) with 400", async () => {
    const payload = validLeadPayload({ correo: undefined });
    const response = await request(app.getHttpServer()).post("/api/v1/leads").send(payload);
    expect(response.status).toBe(400);
  });

  it("rejects a submission with an invalid email format with 400", async () => {
    const payload = validLeadPayload({ correo: "not-an-email" });
    const response = await request(app.getHttpServer()).post("/api/v1/leads").send(payload);
    expect(response.status).toBe(400);
  });

  it("accepts (201) but silently drops a honeypot-flagged submission, never persisting it", async () => {
    const payload = validLeadPayload({ website: "https://spam-bot-filled-this-in.example" });

    const response = await request(app.getHttpServer()).post("/api/v1/leads").send(payload);

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({ nombreCompleto: payload.nombreCompleto });

    const persisted = await prisma.leadSubmission.findFirst({ where: { email: payload.correo } });
    expect(persisted).toBeNull();
  });

  it("rate-limits repeated submissions from the same IP, silently dropping submissions past the limit", async () => {
    // Supertest's in-process requests all resolve to the same loopback
    // IP, so every other test in this file that reaches the service (not
    // rejected by validation) already incremented the same leads:ip:*
    // counter - clear it here so this test's own count is exact,
    // independent of test order.
    const redisClient = app.get(RedisService).getClient();
    const keysToClear = await redisClient.keys("ratelimit:leads:*");
    if (keysToClear.length > 0) {
      await redisClient.del(...keysToClear);
    }

    const max = app.get<ConfigService<EnvConfig, true>>(ConfigService).get("LEADS_RATE_LIMIT_IP_MAX", { infer: true });
    const emails: string[] = [];
    const responses: request.Response[] = [];

    for (let i = 0; i < max + 2; i++) {
      const payload = validLeadPayload();
      emails.push(payload.correo);
      createdEmails.push(payload.correo);
      responses.push(await request(app.getHttpServer()).post("/api/v1/leads").send(payload));
    }

    // Every response still looks like a normal 201 (no disclosure that
    // rate limiting kicked in), but only `max` submissions actually
    // persisted.
    for (const response of responses) {
      expect(response.status).toBe(201);
    }

    const persistedCount = await prisma.leadSubmission.count({ where: { email: { in: emails } } });
    expect(persistedCount).toBe(max);
  });

  it("does not require authentication (public endpoint)", async () => {
    const payload = validLeadPayload();
    createdEmails.push(payload.correo);

    const response = await request(app.getHttpServer()).post("/api/v1/leads").send(payload);
    expect(response.status).toBe(201);
  });
});
