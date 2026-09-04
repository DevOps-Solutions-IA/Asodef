import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { createTestPrismaClient } from "../../database/test-db-client";
import type { RequestContext } from "../auth/auth.service";
import type { LegalDocumentsService } from "../legal-documents/legal-documents.service";
import type { MasterPaymentQuoteService } from "../master/application/master-payment-quote.service";
import type { MasterPaymentPreflightService } from "./master-payment-preflight.service";
import { MasterPaymentOrdersService, type MasterPaymentOrderRow } from "./master-payment-orders.service";

const REQUEST_CONTEXT: RequestContext = {
  ipAddress: "203.0.113.20",
  userAgent: "master-payment-order-test",
  requestId: null,
};

function masterSource(personId: string, amountCents = 5_000_000) {
  return {
    personId,
    document: "1012345678",
    documentType: "CC",
    fullName: "Ana Pérez",
    contractId: `contract-${personId}`,
    installmentId: "8",
    concept: "Cuota 8",
    amountCents,
    currency: "COP" as const,
    dueDate: new Date("2026-09-10T12:00:00.000Z"),
    status: "CURRENT" as const,
  };
}

describe("MasterPaymentOrdersService (integration, real Postgres)", () => {
  let prisma: PrismaClient;
  const subjects = new Set<string>();

  beforeAll(async () => {
    prisma = createTestPrismaClient();
    await prisma.$connect();
  });

  afterEach(async () => {
    if (subjects.size === 0) return;
    const values = [...subjects];
    await prisma.$executeRaw`
      DELETE FROM legacy_bridge.master_payment_events
      WHERE order_id IN (
        SELECT id FROM legacy_bridge.master_payment_orders WHERE subject_ref = ANY(${values}::text[])
      )
    `;
    await prisma.$executeRaw`
      DELETE FROM legacy_bridge.master_payment_orders WHERE subject_ref = ANY(${values}::text[])
    `;
    subjects.clear();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  function harness(source = masterSource(`test-master-${randomUUID()}`)) {
    subjects.add(source.personId);
    const preflight = {
      verify: jest.fn(async () => source),
    } as unknown as MasterPaymentPreflightService;
    const quotes = {
      quote: jest.fn(async () => ({
        status: "VERIFIED" as const,
        data: { amountCents: source.amountCents, dueDate: source.dueDate },
      })),
    } as unknown as MasterPaymentQuoteService;
    const legal = {
      resolveCurrentPublishedVersionId: jest.fn(async () => randomUUID()),
    } as unknown as LegalDocumentsService;
    const config = {
      get: jest.fn(() => 30),
    } as unknown as ConstructorParameters<typeof MasterPaymentOrdersService>[4];
    const service = new MasterPaymentOrdersService(
      prisma as unknown as ConstructorParameters<typeof MasterPaymentOrdersService>[0],
      preflight,
      quotes,
      legal,
      config,
    );
    return { service, preflight, quotes, source };
  }

  it("takes amount and identity only from the Master preflight and marks the durable order source as master", async () => {
    const { service, source, preflight } = harness();

    const response = await service.create("opaque-selector-with-no-trusted-amount", REQUEST_CONTEXT);
    const rows = await prisma.$queryRaw<MasterPaymentOrderRow[]>`
      SELECT * FROM legacy_bridge.master_payment_orders WHERE public_reference = ${response.publicReference}
    `;

    expect(preflight.verify).toHaveBeenCalledWith("opaque-selector-with-no-trusted-amount");
    expect(rows).toHaveLength(1);
    expect(Number(rows[0]!.amount_cents)).toBe(source.amountCents);
    expect(rows[0]!.contract_id).toBe(source.contractId);
    expect(response).toMatchObject({
      source: "master",
      amountCents: source.amountCents,
      legacyApplicationStatus: "NOT_APPLIED",
      providerStatus: null,
    });
  });

  it("is database-idempotent under concurrent create requests and produces no duplicate active order", async () => {
    const { service, source } = harness();

    const [first, second] = await Promise.all([
      service.create("same-selector", REQUEST_CONTEXT),
      service.create("same-selector", REQUEST_CONTEXT),
    ]);
    const counts = await prisma.$queryRaw<{ count: bigint }[]>`
      SELECT count(*)::bigint AS count
      FROM legacy_bridge.master_payment_orders
      WHERE contract_id = ${source.contractId}
        AND installment_id = ${source.installmentId}
        AND status IN ('PENDING','PROCESSING')
    `;

    expect(first.publicReference).toBe(second.publicReference);
    expect(Number(counts[0]!.count)).toBe(1);
  });

  it("re-reads Master before checkout and cancels an unstarted order when the authoritative amount changed", async () => {
    const { service, quotes, source } = harness();
    const response = await service.create("selector", REQUEST_CONTEXT);
    const order = (await service.find(response.publicReference))!;

    (quotes.quote as jest.Mock).mockResolvedValueOnce({
      status: "VERIFIED",
      data: { amountCents: source.amountCents + 100, dueDate: source.dueDate },
    });

    await expect(service.revalidateForCheckout(order)).rejects.toThrow("El saldo cambió");
    const stored = (await service.find(response.publicReference))!;
    expect(stored.status).toBe("CANCELLED");
    expect(stored.failure_code).toBe("MASTER_SNAPSHOT_CHANGED");
  });
});
