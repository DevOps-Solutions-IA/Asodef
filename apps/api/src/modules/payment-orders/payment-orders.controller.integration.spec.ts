import { randomUUID } from "node:crypto";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import request from "supertest";
import { AppModule } from "../../app.module";
import { configureApp } from "../../bootstrap-app";
import { PrismaService } from "../../database/prisma.service";

describe("Payment orders endpoints (integration, real HTTP via the exact configureApp() setup)", () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  const createdCustomerIds: string[] = [];

  beforeAll(async () => {
    app = await NestFactory.create<NestExpressApplication>(AppModule, { logger: false });
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    if (createdCustomerIds.length > 0) {
      await prisma.auditLog.deleteMany({ where: { paymentOrder: { customerId: { in: createdCustomerIds } } } });
      await prisma.paymentOrder.deleteMany({ where: { customerId: { in: createdCustomerIds } } });
      await prisma.obligation.deleteMany({ where: { customerId: { in: createdCustomerIds } } });
      await prisma.customer.deleteMany({ where: { id: { in: createdCustomerIds } } });
    }
    await app.close();
  });

  async function createCustomerWithObligation(status: "PENDING" | "PAID" | "OVERDUE" | "CANCELLED" = "PENDING") {
    const customer = await prisma.customer.create({
      data: {
        documentType: "CC",
        documentNumber: `http-test-${randomUUID()}`,
        fullName: "Cliente HTTP de Prueba",
        email: `${randomUUID()}@example.com`,
        phone: "3000000000",
      },
    });
    createdCustomerIds.push(customer.id);

    const plan = await prisma.plan.upsert({
      where: { name: "Plan Demo" },
      update: {},
      create: { name: "Plan Demo", description: "Plan de prueba para entorno local.", active: true },
    });

    const obligation = await prisma.obligation.create({
      data: {
        customerId: customer.id,
        planId: plan.id,
        concept: "Cuota HTTP de prueba",
        amountCents: 999_900,
        currency: "COP",
        dueDate: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000),
        status,
      },
    });

    return { customer, obligation };
  }

  describe("POST /api/v1/payment-orders", () => {
    it("creates a new order and returns only safe public fields, no internal ids", async () => {
      const { obligation } = await createCustomerWithObligation("PENDING");

      const response = await request(app.getHttpServer()).post("/api/v1/payment-orders").send({ obligationId: obligation.id });

      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({
        amountCents: 999_900,
        currency: "COP",
        status: "PENDING",
        statusLabel: "Pendiente",
        obligation: { concept: "Cuota HTTP de prueba" },
      });
      expect(response.body.publicReference).toMatch(/^[A-Za-z0-9_-]{20,}$/);
      expect(response.body).not.toHaveProperty("id");
      expect(response.body).not.toHaveProperty("obligationId");
      expect(response.body).not.toHaveProperty("customerId");
      expect(response.body.obligation).not.toHaveProperty("id");
    });

    it("does not require authentication (public endpoint)", async () => {
      const { obligation } = await createCustomerWithObligation("PENDING");
      const response = await request(app.getHttpServer()).post("/api/v1/payment-orders").send({ obligationId: obligation.id });
      expect(response.status).toBe(201);
    });

    it("returns the same publicReference for repeated requests (idempotent at the HTTP layer too)", async () => {
      const { obligation } = await createCustomerWithObligation("PENDING");

      const first = await request(app.getHttpServer()).post("/api/v1/payment-orders").send({ obligationId: obligation.id });
      const second = await request(app.getHttpServer()).post("/api/v1/payment-orders").send({ obligationId: obligation.id });

      expect(second.body.publicReference).toBe(first.body.publicReference);
    });

    it("rejects an already-paid obligation with 409 and creates no order", async () => {
      const { obligation } = await createCustomerWithObligation("PAID");

      const response = await request(app.getHttpServer()).post("/api/v1/payment-orders").send({ obligationId: obligation.id });

      expect(response.status).toBe(409);
      const orderCount = await prisma.paymentOrder.count({ where: { obligationId: obligation.id } });
      expect(orderCount).toBe(0);
    });

    it("returns 404 for a non-existent obligationId", async () => {
      const response = await request(app.getHttpServer()).post("/api/v1/payment-orders").send({ obligationId: randomUUID() });
      expect(response.status).toBe(404);
    });

    it("rejects a malformed obligationId with 400", async () => {
      const response = await request(app.getHttpServer()).post("/api/v1/payment-orders").send({ obligationId: "not-a-uuid" });
      expect(response.status).toBe(400);
    });
  });

  describe("GET /api/v1/payment-orders/:reference", () => {
    it("returns order details for a valid public reference", async () => {
      const { obligation } = await createCustomerWithObligation("PENDING");
      const created = await request(app.getHttpServer()).post("/api/v1/payment-orders").send({ obligationId: obligation.id });

      const response = await request(app.getHttpServer()).get(`/api/v1/payment-orders/${created.body.publicReference}`);

      expect(response.status).toBe(200);
      expect(response.body.publicReference).toBe(created.body.publicReference);
      expect(response.body.obligation.concept).toBe("Cuota HTTP de prueba");
      expect(response.body).not.toHaveProperty("id");
    });

    it("returns a generic 404 for a non-existent reference (no information leakage)", async () => {
      const response = await request(app.getHttpServer()).get("/api/v1/payment-orders/this-reference-does-not-exist");
      expect(response.status).toBe(404);
      expect(response.body.message).toBe("No se encontraron resultados.");
    });

    it("does not require authentication", async () => {
      const { obligation } = await createCustomerWithObligation("PENDING");
      const created = await request(app.getHttpServer()).post("/api/v1/payment-orders").send({ obligationId: obligation.id });

      const response = await request(app.getHttpServer()).get(`/api/v1/payment-orders/${created.body.publicReference}`);
      expect(response.status).toBe(200);
    });
  });
});
