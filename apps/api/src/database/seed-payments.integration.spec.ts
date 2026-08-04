import { randomUUID } from "node:crypto";
import { Prisma, PrismaClient } from "@prisma/client";
import { createTestPrismaClient } from "./test-db-client";
import { seedPayments } from "./seed-payments";

describe("Payments domain schema + seed (integration, real Postgres)", () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    prisma = createTestPrismaClient();
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("is idempotent: running the seed twice creates at least 2 demo customers, without duplicating them", async () => {
    await seedPayments(prisma);
    const afterFirst = await prisma.customer.count({ where: { email: { endsWith: "@example.com" } } });
    expect(afterFirst).toBeGreaterThanOrEqual(2);

    await seedPayments(prisma);
    const afterSecond = await prisma.customer.count({ where: { email: { endsWith: "@example.com" } } });
    expect(afterSecond).toBe(afterFirst);
  });

  it("does not duplicate the seeded obligations on a second run", async () => {
    await seedPayments(prisma);
    const afterFirst = await prisma.obligation.count({ where: { concept: { contains: "Cliente Demo" } } });

    await seedPayments(prisma);
    const afterSecond = await prisma.obligation.count({ where: { concept: { contains: "Cliente Demo" } } });

    expect(afterSecond).toBe(afterFirst);
  });

  it("Example (AC): querying Obligation for a seeded demo customer's document number returns at least one PENDING obligation", async () => {
    await seedPayments(prisma);

    const customer = await prisma.customer.findUniqueOrThrow({
      where: { documentType_documentNumber: { documentType: "CC", documentNumber: "1000000001" } },
    });
    const obligations = await prisma.obligation.findMany({ where: { customerId: customer.id, status: "PENDING" } });

    expect(obligations.length).toBeGreaterThanOrEqual(1);
  });

  it("seeds real amountCents as an integer, never a float", async () => {
    await seedPayments(prisma);

    const customer = await prisma.customer.findUniqueOrThrow({
      where: { documentType_documentNumber: { documentType: "CC", documentNumber: "1000000001" } },
    });
    const obligation = await prisma.obligation.findFirstOrThrow({ where: { customerId: customer.id } });

    expect(Number.isInteger(obligation.amountCents)).toBe(true);
  });

  it("Negative case (AC): inserting a PaymentEvent with a duplicate idempotencyKey violates the unique constraint at the database level", async () => {
    await seedPayments(prisma);

    const customer = await prisma.customer.findUniqueOrThrow({
      where: { documentType_documentNumber: { documentType: "CC", documentNumber: "1000000001" } },
    });
    const obligation = await prisma.obligation.findFirstOrThrow({ where: { customerId: customer.id } });

    const publicReference = `test-ref-${randomUUID()}`;
    const paymentOrder = await prisma.paymentOrder.create({
      data: {
        publicReference,
        obligationId: obligation.id,
        customerId: customer.id,
        amountCents: obligation.amountCents,
        currency: obligation.currency,
        status: "PENDING",
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    });

    const idempotencyKey = `test-idempotency-${randomUUID()}`;
    await prisma.paymentEvent.create({
      data: {
        paymentOrderId: paymentOrder.id,
        source: "webhook",
        eventType: "payment.approved",
        idempotencyKey,
        payload: { test: true },
      },
    });

    await expect(
      prisma.paymentEvent.create({
        data: {
          paymentOrderId: paymentOrder.id,
          source: "webhook",
          eventType: "payment.approved",
          idempotencyKey,
          payload: { test: true, duplicate: true },
        },
      }),
    ).rejects.toThrow(Prisma.PrismaClientKnownRequestError);

    await prisma.paymentEvent.deleteMany({ where: { paymentOrderId: paymentOrder.id } });
    await prisma.paymentOrder.delete({ where: { id: paymentOrder.id } });
  });
});
