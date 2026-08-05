import { randomUUID } from "node:crypto";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import request from "supertest";
import type { PrismaClient } from "@prisma/client";
import { AppModule } from "../../app.module";
import { configureApp } from "../../bootstrap-app";
import { PrismaService } from "../../database/prisma.service";
import { publishDraftForTest, type PublishedForTestHandle } from "../../database/publish-legal-document-for-test";

describe("Payments lookup endpoint (integration, real HTTP via the exact configureApp() setup)", () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  const createdCustomerIds: string[] = [];
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
    await app.close();
  });

  async function createCustomerWithObligation(
    documentNumber: string,
    status: "PENDING" | "PAID" | "OVERDUE" | "CANCELLED" = "PENDING",
  ) {
    const customer = await prisma.customer.create({
      data: {
        documentType: "CC",
        documentNumber,
        fullName: "Cliente Lookup de Prueba",
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
        concept: "Cuota de lookup de prueba",
        amountCents: 555_500,
        currency: "COP",
        dueDate: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000),
        status,
      },
    });

    return { customer, obligation };
  }

  it("looks up by document and returns masked customer info + outstanding obligations", async () => {
    const documentNumber = `lookup-${randomUUID()}`;
    const { obligation } = await createCustomerWithObligation(documentNumber, "PENDING");

    const response = await request(app.getHttpServer())
      .post("/api/v1/payments/lookup")
      .send({ documentType: "CC", documentNumber });

    expect(response.status).toBe(200);
    expect(response.body.type).toBe("customer");
    expect(response.body.customer.fullName).toBe("Cliente Lookup de Prueba");
    expect(response.body.customer.maskedDocumentNumber).toBe("•".repeat(documentNumber.length - 4) + documentNumber.slice(-4));
    expect(response.body.customer).not.toHaveProperty("documentNumber");
    expect(response.body.customer).not.toHaveProperty("email");
    expect(response.body.customer).not.toHaveProperty("phone");
    expect(response.body.obligations).toHaveLength(1);
    expect(response.body.obligations[0]).toMatchObject({ obligationId: obligation.id, concept: "Cuota de lookup de prueba" });
  });

  it("Example (AC): masks the document number, showing only the last characters", async () => {
    const documentNumber = "1234567890";
    await createCustomerWithObligation(documentNumber, "PENDING");

    const response = await request(app.getHttpServer())
      .post("/api/v1/payments/lookup")
      .send({ documentType: "CC", documentNumber });

    expect(response.body.customer.maskedDocumentNumber).toBe("••••••7890");
  });

  it("Negative case (AC): a non-existent document returns a generic 404 with no information leakage", async () => {
    const response = await request(app.getHttpServer())
      .post("/api/v1/payments/lookup")
      .send({ documentType: "CC", documentNumber: `does-not-exist-${randomUUID()}` });

    expect(response.status).toBe(404);
    expect(response.body.message).toBe("No se encontraron resultados.");
  });

  it("treats a real customer with zero outstanding obligations the same as not-found (no enumeration)", async () => {
    const documentNumber = `paid-only-${randomUUID()}`;
    await createCustomerWithObligation(documentNumber, "PAID");

    const response = await request(app.getHttpServer())
      .post("/api/v1/payments/lookup")
      .send({ documentType: "CC", documentNumber });

    expect(response.status).toBe(404);
    expect(response.body.message).toBe("No se encontraron resultados.");
  });

  it("looks up by reference and returns the order (same shape as GET /payment-orders/:reference)", async () => {
    const documentNumber = `ref-lookup-${randomUUID()}`;
    const { obligation } = await createCustomerWithObligation(documentNumber, "PENDING");
    const created = await request(app.getHttpServer()).post("/api/v1/payment-orders").send({ obligationId: obligation.id });

    const response = await request(app.getHttpServer()).post("/api/v1/payments/lookup").send({ reference: created.body.publicReference });

    expect(response.status).toBe(200);
    expect(response.body.type).toBe("order");
    expect(response.body.order.publicReference).toBe(created.body.publicReference);
  });

  it("Negative case (AC): a non-existent reference returns the same generic 404 message", async () => {
    const response = await request(app.getHttpServer()).post("/api/v1/payments/lookup").send({ reference: "does-not-exist" });
    expect(response.status).toBe(404);
    expect(response.body.message).toBe("No se encontraron resultados.");
  });

  it("returns 400 when neither a document nor a reference is provided", async () => {
    const response = await request(app.getHttpServer()).post("/api/v1/payments/lookup").send({});
    expect(response.status).toBe(400);
  });

  it("does not require authentication", async () => {
    const response = await request(app.getHttpServer()).post("/api/v1/payments/lookup").send({ reference: "anything" });
    expect(response.status).not.toBe(401);
  });
});
