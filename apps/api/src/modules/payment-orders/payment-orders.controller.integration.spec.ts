import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import request from "supertest";
import { AppModule } from "../../app.module";
import { configureApp } from "../../bootstrap-app";
import { PrismaService } from "../../database/prisma.service";
import { publishDraftForTest, type PublishedForTestHandle } from "../../database/publish-legal-document-for-test";
import { upsertActivePlanDemo } from "../../database/seed-payments";

describe("Payment orders endpoints (integration, real HTTP via the exact configureApp() setup)", () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  const createdCustomerIds: string[] = [];
  const createdPlanIds: string[] = [];
  let terminosHandle: PublishedForTestHandle | null = null;

  beforeAll(async () => {
    app = await NestFactory.create<NestExpressApplication>(AppModule, { logger: false });
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);

    // US-046: order creation now records payment_terms consent, which
    // requires a resolvable, currently PUBLISHED terminos-de-pago
    // version - see publishDraftForTest's own doc comment.
    terminosHandle = await publishDraftForTest(prisma as unknown as PrismaClient, "terminos-de-pago");
  });

  afterAll(async () => {
    if (terminosHandle) {
      await terminosHandle.restore();
    }
    if (createdCustomerIds.length > 0) {
      await prisma.auditLog.deleteMany({ where: { paymentOrder: { customerId: { in: createdCustomerIds } } } });
      await prisma.paymentOrder.deleteMany({ where: { customerId: { in: createdCustomerIds } } });
      await prisma.obligation.deleteMany({ where: { customerId: { in: createdCustomerIds } } });
      await prisma.customer.deleteMany({ where: { id: { in: createdCustomerIds } } });
    }
    if (createdPlanIds.length > 0) {
      // plans.current_version_id -> plan_versions is Restrict, so it
      // must be cleared before the version rows can be deleted.
      await prisma.plan.updateMany({ where: { id: { in: createdPlanIds } }, data: { currentVersionId: null } });
      await prisma.planVersion.deleteMany({ where: { planId: { in: createdPlanIds } } });
      await prisma.plan.deleteMany({ where: { id: { in: createdPlanIds } } });
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

    const plan = await upsertActivePlanDemo(prisma);

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

  /** Negative case (AC): a customer whose obligation is tied to a plan
   * that is not ACTIVE (e.g. SUSPENDED) - a dedicated fixture separate
   * from the shared "Plan Demo", so no other test's assumptions are
   * disturbed by this one deliberately-not-ACTIVE plan. */
  async function createCustomerWithSuspendedPlanObligation() {
    const customer = await prisma.customer.create({
      data: {
        documentType: "CC",
        documentNumber: `http-suspended-${randomUUID()}`,
        fullName: "Cliente Plan Suspendido",
        email: `${randomUUID()}@example.com`,
        phone: "3000000000",
      },
    });
    createdCustomerIds.push(customer.id);

    const plan = await prisma.plan.create({ data: { name: `Plan Suspendido ${randomUUID()}` } });
    createdPlanIds.push(plan.id);
    const version = await prisma.planVersion.create({
      data: {
        planId: plan.id,
        version: 1,
        internalName: "Plan Suspendido de Prueba",
        publicName: "Plan Suspendido de Prueba",
        description: "Plan de prueba en estado suspendido.",
        priceCents: 100_000,
        billingFrequency: "mensual",
        status: "SUSPENDED",
      },
    });
    await prisma.plan.update({ where: { id: plan.id }, data: { currentVersionId: version.id } });

    const obligation = await prisma.obligation.create({
      data: {
        customerId: customer.id,
        planId: plan.id,
        concept: "Cuota con plan suspendido",
        amountCents: 100_000,
        currency: "COP",
        dueDate: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000),
        status: "PENDING",
      },
    });

    return { customer, obligation };
  }

  describe("GET /api/v1/payment-orders/disclosure/:obligationId", () => {
    it("Example (AC): returns the exact ACTIVE plan version fields for the obligation", async () => {
      const { obligation } = await createCustomerWithObligation("PENDING");
      const plan = await upsertActivePlanDemo(prisma);
      const activeVersion = await prisma.planVersion.findUniqueOrThrow({ where: { id: plan.currentVersionId! } });

      const response = await request(app.getHttpServer()).get(`/api/v1/payment-orders/disclosure/${obligation.id}`);

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        planVersionId: activeVersion.id,
        name: activeVersion.publicName,
        description: activeVersion.description,
        total: activeVersion.priceCents,
        currency: "COP",
        concept: "Cuota HTTP de prueba",
        frequency: activeVersion.billingFrequency,
      });
      expect(response.body.contactChannel).toBeTruthy();
      expect(response.body.pqrChannel).toBeTruthy();
    });

    it("Negative case (AC): an obligation whose plan is SUSPENDED (not ACTIVE) returns 409", async () => {
      const { obligation } = await createCustomerWithSuspendedPlanObligation();

      const response = await request(app.getHttpServer()).get(`/api/v1/payment-orders/disclosure/${obligation.id}`);

      expect(response.status).toBe(409);
    });

    it("returns 404 for a non-existent obligationId", async () => {
      const response = await request(app.getHttpServer()).get(`/api/v1/payment-orders/disclosure/${randomUUID()}`);
      expect(response.status).toBe(404);
    });

    it("does not require authentication", async () => {
      const { obligation } = await createCustomerWithObligation("PENDING");
      const response = await request(app.getHttpServer()).get(`/api/v1/payment-orders/disclosure/${obligation.id}`);
      expect(response.status).toBe(200);
    });
  });

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

    it("Negative case (AC): an obligation whose plan is SUSPENDED returns 409 and creates no order", async () => {
      const { obligation } = await createCustomerWithSuspendedPlanObligation();

      const response = await request(app.getHttpServer()).post("/api/v1/payment-orders").send({ obligationId: obligation.id });

      expect(response.status).toBe(409);
      const orderCount = await prisma.paymentOrder.count({ where: { obligationId: obligation.id } });
      expect(orderCount).toBe(0);
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
