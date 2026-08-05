import { randomUUID } from "node:crypto";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import request from "supertest";
import { AppModule } from "../../app.module";
import { configureApp } from "../../bootstrap-app";
import { PrismaService } from "../../database/prisma.service";
import { seedConsentPurposes } from "../../database/seed-consent-purposes";

describe("POST /api/v1/communications/unsubscribe (integration, real HTTP)", () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  const createdCustomerIds: string[] = [];

  beforeAll(async () => {
    app = await NestFactory.create<NestExpressApplication>(AppModule, { logger: false });
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    await seedConsentPurposes(prisma);
  });

  afterAll(async () => {
    if (createdCustomerIds.length > 0) {
      await prisma.consentRecord.deleteMany({ where: { customerId: { in: createdCustomerIds } } });
      await prisma.customer.deleteMany({ where: { id: { in: createdCustomerIds } } });
    }
    await app.close();
  });

  it("does not require authentication and adds a SuppressionListEntry", async () => {
    const customer = await prisma.customer.create({
      data: {
        documentType: "CC",
        documentNumber: `unsubscribe-test-${randomUUID()}`,
        fullName: "Cliente Baja de Prueba",
        email: `${randomUUID()}@example.com`,
        phone: "3000000000",
      },
    });
    createdCustomerIds.push(customer.id);

    const response = await request(app.getHttpServer())
      .post("/api/v1/communications/unsubscribe")
      .send({ channel: "email", recipient: customer.email, reason: "No quiero más correos." });

    expect(response.status).toBe(204);

    const suppression = await prisma.suppressionListEntry.findUnique({
      where: { channel_recipient: { channel: "email", recipient: customer.email } },
    });
    expect(suppression).not.toBeNull();
    expect(suppression?.reason).toBe("No quiero más correos.");

    await prisma.suppressionListEntry.deleteMany({ where: { channel: "email", recipient: customer.email } });
  });

  it("defaults to a generic reason when none is supplied", async () => {
    const recipient = `${randomUUID()}@example.com`;
    const response = await request(app.getHttpServer()).post("/api/v1/communications/unsubscribe").send({ channel: "email", recipient });
    expect(response.status).toBe(204);

    const suppression = await prisma.suppressionListEntry.findUnique({ where: { channel_recipient: { channel: "email", recipient } } });
    expect(suppression?.reason).toBeTruthy();

    await prisma.suppressionListEntry.deleteMany({ where: { channel: "email", recipient } });
  });

  it("rejects a request missing the required channel/recipient fields", async () => {
    const response = await request(app.getHttpServer()).post("/api/v1/communications/unsubscribe").send({});
    expect(response.status).toBe(400);
  });
});
