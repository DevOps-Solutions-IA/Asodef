import { randomUUID } from "node:crypto";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import request from "supertest";
import type { PaymentOrderStatus } from "@prisma/client";
import { AppModule } from "../../app.module";
import { configureApp } from "../../bootstrap-app";
import { PrismaService } from "../../database/prisma.service";
import { generatePublicReference } from "../payment-orders/public-reference";

describe("Receipts endpoint (integration, real HTTP, BOLD_MODE=mock)", () => {
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
      await prisma.paymentReceipt.deleteMany({ where: { paymentOrder: { customerId: { in: createdCustomerIds } } } });
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
        documentNumber: `receipt-test-${randomUUID()}`,
        fullName: "Cliente Recibo de Prueba",
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
        concept: "Cuota recibo de prueba",
        amountCents: 250_000,
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

  it("Example (AC): a receipt is auto-created when a mock Bold create resolves an order to APPROVED, and GET returns matching amount/date/reference", async () => {
    const { order, customer } = await createOrder("PENDING");

    const createResponse = await request(app.getHttpServer()).post("/api/v1/payments/bold/create").send({ reference: order.publicReference });
    expect(createResponse.body.orderStatus).toBe("APPROVED");

    const receipt = await request(app.getHttpServer()).get(`/api/v1/receipts/${order.publicReference}`);
    expect(receipt.status).toBe(200);
    expect(receipt.body).toMatchObject({
      publicReference: order.publicReference,
      amountCents: 250_000,
      currency: "COP",
      status: "APPROVED",
      statusLabel: "Aprobado",
      concept: "Cuota recibo de prueba",
    });
    expect(receipt.body.receiptNumber).toMatch(/^RCP-/);
    expect(receipt.body.verificationCode).toBeTruthy();
    expect(receipt.body.maskedDocumentNumber).toBe("•".repeat(customer.documentNumber.length - 4) + customer.documentNumber.slice(-4));
    expect(receipt.body).not.toHaveProperty("id");
    expect(receipt.body).not.toHaveProperty("paymentOrderId");

    const dbReceipt = await prisma.paymentReceipt.findFirst({ where: { paymentOrderId: order.id } });
    expect(dbReceipt).not.toBeNull();
  });

  it("creates exactly one PaymentReceipt even if the approved order is polled multiple times afterward", async () => {
    const { order } = await createOrder("PENDING");
    await request(app.getHttpServer()).post("/api/v1/payments/bold/create").send({ reference: order.publicReference });

    await request(app.getHttpServer()).get(`/api/v1/payments/${order.publicReference}/status`);
    await request(app.getHttpServer()).get(`/api/v1/payments/${order.publicReference}/status`);

    const receipts = await prisma.paymentReceipt.count({ where: { paymentOrderId: order.id } });
    expect(receipts).toBe(1);
  });

  it("Negative case (AC): a PENDING order has no receipt and returns 404", async () => {
    const { order } = await createOrder("PENDING");
    const response = await request(app.getHttpServer()).get(`/api/v1/receipts/${order.publicReference}`);
    expect(response.status).toBe(404);
    expect(response.body.message).toBe("No se encontraron resultados.");
  });

  it("Negative case (AC): a REJECTED order has no receipt, returns 404, and creates no PaymentReceipt row", async () => {
    const { order } = await createOrder("REJECTED");
    const response = await request(app.getHttpServer()).get(`/api/v1/receipts/${order.publicReference}`);
    expect(response.status).toBe(404);
    const receiptCount = await prisma.paymentReceipt.count({ where: { paymentOrderId: order.id } });
    expect(receiptCount).toBe(0);
  });

  it("returns 404 for a non-existent reference", async () => {
    const response = await request(app.getHttpServer()).get("/api/v1/receipts/does-not-exist");
    expect(response.status).toBe(404);
  });

  it("downloads a PDF via ?format=pdf with the correct content type, and caches it for the next request", async () => {
    const { order } = await createOrder("PENDING");
    await request(app.getHttpServer()).post("/api/v1/payments/bold/create").send({ reference: order.publicReference });

    const response = await request(app.getHttpServer()).get(`/api/v1/receipts/${order.publicReference}?format=pdf`);
    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toContain("application/pdf");
    expect(response.body.slice(0, 4).toString()).toBe("%PDF");

    const receipt = await prisma.paymentReceipt.findFirstOrThrow({ where: { paymentOrderId: order.id } });
    expect(receipt.pdfPath).toBeTruthy();

    const second = await request(app.getHttpServer()).get(`/api/v1/receipts/${order.publicReference}?format=pdf`);
    expect(second.status).toBe(200);
    expect(second.body.slice(0, 4).toString()).toBe("%PDF");
  });

  it("downloads a PDF via the Accept header instead of the query param", async () => {
    const { order } = await createOrder("PENDING");
    await request(app.getHttpServer()).post("/api/v1/payments/bold/create").send({ reference: order.publicReference });

    const response = await request(app.getHttpServer()).get(`/api/v1/receipts/${order.publicReference}`).set("Accept", "application/pdf");
    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toContain("application/pdf");
  });

  it("does not require authentication", async () => {
    const { order } = await createOrder("PENDING");
    await request(app.getHttpServer()).post("/api/v1/payments/bold/create").send({ reference: order.publicReference });
    const response = await request(app.getHttpServer()).get(`/api/v1/receipts/${order.publicReference}`);
    expect(response.status).not.toBe(401);
  });
});
