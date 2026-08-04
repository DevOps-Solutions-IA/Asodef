import { randomUUID } from "node:crypto";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import request from "supertest";
import type { PaymentOrderStatus } from "@prisma/client";
import { AppModule } from "../../app.module";
import { configureApp } from "../../bootstrap-app";
import { PrismaService } from "../../database/prisma.service";
import { MockBoldTransport } from "../payment-providers/mock-bold.transport";
import { generatePublicReference } from "../payment-orders/public-reference";

describe("Bold payment creation and status endpoints (integration, real HTTP, BOLD_MODE=mock)", () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let mockBoldTransport: MockBoldTransport;
  const createdCustomerIds: string[] = [];

  beforeAll(async () => {
    app = await NestFactory.create<NestExpressApplication>(AppModule, { logger: false });
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    mockBoldTransport = app.get(MockBoldTransport);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    mockBoldTransport.reset();
  });

  afterAll(async () => {
    if (createdCustomerIds.length > 0) {
      await prisma.paymentEvent.deleteMany({ where: { paymentOrder: { customerId: { in: createdCustomerIds } } } });
      await prisma.paymentTransaction.deleteMany({ where: { paymentAttempt: { paymentOrder: { customerId: { in: createdCustomerIds } } } } });
      await prisma.paymentAttempt.deleteMany({ where: { paymentOrder: { customerId: { in: createdCustomerIds } } } });
      await prisma.paymentOrder.deleteMany({ where: { customerId: { in: createdCustomerIds } } });
      await prisma.obligation.deleteMany({ where: { customerId: { in: createdCustomerIds } } });
      await prisma.customer.deleteMany({ where: { id: { in: createdCustomerIds } } });
    }
    await app.close();
  });

  async function createOrder(status: PaymentOrderStatus = "PENDING") {
    const customer = await prisma.customer.create({
      data: {
        documentType: "CC",
        documentNumber: `bold-test-${randomUUID()}`,
        fullName: "Cliente Bold de Prueba",
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
        concept: "Cuota Bold de prueba",
        amountCents: 321_000,
        currency: "COP",
        dueDate: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000),
        status: "PENDING",
      },
    });

    const order = await prisma.paymentOrder.create({
      data: {
        publicReference: generatePublicReference(),
        obligationId: obligation.id,
        customerId: customer.id,
        amountCents: obligation.amountCents,
        currency: obligation.currency,
        status,
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      },
    });

    return { customer, obligation, order };
  }

  describe("POST /api/v1/payments/bold/create", () => {
    it("Example (AC): a valid PENDING order creates an attempt and reaches a PROCESSING (RUNNING) state with a mock next-action payload", async () => {
      const { order } = await createOrder("PENDING");
      mockBoldTransport.setNextPaymentStatus("PROCESSING");

      const response = await request(app.getHttpServer()).post("/api/v1/payments/bold/create").send({ reference: order.publicReference });

      expect(response.status).toBe(201);
      expect(response.body.publicReference).toBe(order.publicReference);
      expect(response.body.orderStatus).toBe("PROCESSING");
      expect(response.body.orderStatusLabel).toBe("Procesando");
      expect(response.body.providerNextAction).toBeTruthy();
      expect(response.body).not.toHaveProperty("id");

      const attempts = await prisma.paymentAttempt.findMany({ where: { paymentOrderId: order.id } });
      expect(attempts).toHaveLength(1);
      expect(attempts[0]?.status).toBe("PENDING");

      const transactions = await prisma.paymentTransaction.findMany({ where: { paymentAttemptId: attempts[0]?.id } });
      expect(transactions).toHaveLength(1);
      expect(transactions[0]?.status).toBe("PROCESSING");

      const events = await prisma.paymentEvent.findMany({ where: { paymentOrderId: order.id } });
      expect(events).toHaveLength(1);
      expect(events[0]?.eventType).toBe("payment.create");
    });

    it("a valid PENDING order that resolves immediately (mock default APPROVED) reaches an APPROVED order status", async () => {
      const { order } = await createOrder("PENDING");

      const response = await request(app.getHttpServer()).post("/api/v1/payments/bold/create").send({ reference: order.publicReference });

      expect(response.status).toBe(201);
      expect(response.body.orderStatus).toBe("APPROVED");
      expect(response.body.orderStatusLabel).toBe("Aprobado");

      const updatedOrder = await prisma.paymentOrder.findUniqueOrThrow({ where: { id: order.id } });
      expect(updatedOrder.status).toBe("APPROVED");
    });

    it("Negative case (AC): requesting Bold payment creation for an already-APPROVED order returns 409 and creates no attempt", async () => {
      const { order } = await createOrder("APPROVED");

      const response = await request(app.getHttpServer()).post("/api/v1/payments/bold/create").send({ reference: order.publicReference });

      expect(response.status).toBe(409);
      const attempts = await prisma.paymentAttempt.count({ where: { paymentOrderId: order.id } });
      expect(attempts).toBe(0);
    });

    it("rejects a CANCELLED order with 409 and creates no attempt", async () => {
      const { order } = await createOrder("CANCELLED");
      const response = await request(app.getHttpServer()).post("/api/v1/payments/bold/create").send({ reference: order.publicReference });
      expect(response.status).toBe(409);
      expect(await prisma.paymentAttempt.count({ where: { paymentOrderId: order.id } })).toBe(0);
    });

    it("returns a generic 404 for a non-existent order reference (no information leakage)", async () => {
      const response = await request(app.getHttpServer()).post("/api/v1/payments/bold/create").send({ reference: "does-not-exist" });
      expect(response.status).toBe(404);
      expect(response.body.message).toBe("No se encontraron resultados.");
    });

    it("rejects an empty reference with 400", async () => {
      const response = await request(app.getHttpServer()).post("/api/v1/payments/bold/create").send({ reference: "" });
      expect(response.status).toBe(400);
    });

    it("idempotent replay: a repeated create call while unresolved reuses the same attempt and does not call the provider again", async () => {
      const { order } = await createOrder("PENDING");
      mockBoldTransport.setNextPaymentStatus("RUNNING");
      const createPaymentSpy = jest.spyOn(mockBoldTransport, "createPayment");

      const first = await request(app.getHttpServer()).post("/api/v1/payments/bold/create").send({ reference: order.publicReference });
      expect(first.status).toBe(201);
      expect(first.body.orderStatus).toBe("PROCESSING");
      expect(createPaymentSpy).toHaveBeenCalledTimes(1);

      const second = await request(app.getHttpServer()).post("/api/v1/payments/bold/create").send({ reference: order.publicReference });
      expect(second.status).toBe(201);
      expect(second.body.orderStatus).toBe("PROCESSING");
      // Provider must not have been called a second time for the same
      // unresolved attempt (PRD: "provider not called twice").
      expect(createPaymentSpy).toHaveBeenCalledTimes(1);

      const attempts = await prisma.paymentAttempt.count({ where: { paymentOrderId: order.id } });
      expect(attempts).toBe(1);
    });

    it("preserves an unknown Bold status as a safe non-success PROCESSING state instead of erroring or approving", async () => {
      const { order } = await createOrder("PENDING");
      mockBoldTransport.setNextPaymentStatus("SOME_FUTURE_BOLD_STATUS");

      const response = await request(app.getHttpServer()).post("/api/v1/payments/bold/create").send({ reference: order.publicReference });

      expect(response.status).toBe(201);
      expect(response.body.orderStatus).toBe("PROCESSING");

      const updatedOrder = await prisma.paymentOrder.findUniqueOrThrow({ where: { id: order.id } });
      expect(updatedOrder.status).toBe("PROCESSING");
    });

    it("does not require authentication", async () => {
      const { order } = await createOrder("PENDING");
      const response = await request(app.getHttpServer()).post("/api/v1/payments/bold/create").send({ reference: order.publicReference });
      expect(response.status).not.toBe(401);
    });
  });

  describe("GET /api/v1/payments/:reference/status", () => {
    it("returns the order's current state without calling the provider when no attempt exists yet", async () => {
      const { order } = await createOrder("PENDING");
      const getPaymentStatusSpy = jest.spyOn(mockBoldTransport, "getPayment");

      const response = await request(app.getHttpServer()).get(`/api/v1/payments/${order.publicReference}/status`);

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({ publicReference: order.publicReference, orderStatus: "PENDING", attemptStatus: null });
      expect(getPaymentStatusSpy).not.toHaveBeenCalled();
    });

    it("calls the provider for an in-flight attempt and records a new status snapshot", async () => {
      const { order } = await createOrder("PENDING");
      mockBoldTransport.setNextPaymentStatus("RUNNING");
      await request(app.getHttpServer()).post("/api/v1/payments/bold/create").send({ reference: order.publicReference });

      const getPaymentSpy = jest.spyOn(mockBoldTransport, "getPayment");
      const response = await request(app.getHttpServer()).get(`/api/v1/payments/${order.publicReference}/status`);

      expect(response.status).toBe(200);
      // MockBoldTransport.getPayment() replays whatever the last
      // createPayment() call stored (RUNNING) - it has no independent
      // "resolve later" mechanism, so the mapped status is unchanged;
      // what this test verifies is that the provider actually got
      // called and a new PaymentTransaction snapshot was recorded.
      expect(response.body.orderStatus).toBe("PROCESSING");
      expect(response.body.attemptStatus).toBe("PENDING");
      expect(getPaymentSpy).toHaveBeenCalledTimes(1);
      expect(getPaymentSpy).toHaveBeenCalledWith(order.publicReference);

      const attempt = await prisma.paymentAttempt.findFirstOrThrow({ where: { paymentOrderId: order.id } });
      const transactions = await prisma.paymentTransaction.findMany({ where: { paymentAttemptId: attempt.id } });
      expect(transactions).toHaveLength(2);
    });

    it("avoids an unnecessary provider call once the attempt is already terminal", async () => {
      const { order } = await createOrder("PENDING");
      await request(app.getHttpServer()).post("/api/v1/payments/bold/create").send({ reference: order.publicReference }); // resolves to APPROVED (mock default)

      const getPaymentStatusSpy = jest.spyOn(mockBoldTransport, "getPayment");
      const response = await request(app.getHttpServer()).get(`/api/v1/payments/${order.publicReference}/status`);

      expect(response.status).toBe(200);
      expect(response.body.orderStatus).toBe("APPROVED");
      expect(getPaymentStatusSpy).not.toHaveBeenCalled();
    });

    it("returns a generic 404 for a non-existent reference", async () => {
      const response = await request(app.getHttpServer()).get("/api/v1/payments/does-not-exist/status");
      expect(response.status).toBe(404);
      expect(response.body.message).toBe("No se encontraron resultados.");
    });

    it("does not require authentication", async () => {
      const { order } = await createOrder("PENDING");
      const response = await request(app.getHttpServer()).get(`/api/v1/payments/${order.publicReference}/status`);
      expect(response.status).not.toBe(401);
    });
  });
});
