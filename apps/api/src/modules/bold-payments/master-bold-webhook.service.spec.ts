import { BadRequestException } from "@nestjs/common";
import { MasterBoldWebhookService } from "./master-bold-webhook.service";

function notification(type = "SALE_APPROVED") {
  return {
    id: "191850cb-00f8-4f64-aa5f-4975848e9428",
    type,
    subject: "BOLD-PAYMENT-1",
    data: {
      payment_id: "BOLD-PAYMENT-1",
      metadata: { reference: "master-public-reference" },
    },
  };
}

describe("MasterBoldWebhookService", () => {
  const order = {
    id: "7808ee2a-399b-4f4e-b124-e5735810cf86",
    public_reference: "master-public-reference",
  };

  function harness(options?: {
    verified?: boolean;
    found?: boolean;
    lockedLegacyState?: string;
    existingTransactionId?: string | null;
    duplicate?: boolean;
  }) {
    const paymentProvider = {
      validateNotification: jest.fn().mockResolvedValue({
        verified: options?.verified ?? true,
        raw: notification(),
      }),
    };
    const orders = {
      find: jest.fn().mockResolvedValue((options?.found ?? true) ? order : null),
    };
    const tx = {
      $queryRaw: jest.fn()
        .mockResolvedValueOnce([{
          provider_transaction_id: options?.existingTransactionId ?? null,
          legacy_application_state: options?.lockedLegacyState ?? "NOT_APPLIED",
        }])
        .mockResolvedValueOnce(options?.duplicate ? [] : [{ id: "event-id" }]),
      $executeRaw: jest.fn().mockResolvedValue(1),
    };
    const prisma = {
      $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    };
    const service = new MasterBoldWebhookService(prisma as never, orders as never, paymentProvider as never);
    return { service, prisma, tx, orders, paymentProvider };
  }

  it("rejects an unverified notification before looking up or mutating an order", async () => {
    const { service, prisma, orders } = harness({ verified: false });
    const payload = notification();

    await expect(service.handle(payload, Buffer.from(JSON.stringify(payload)), {})).rejects.toBeInstanceOf(BadRequestException);
    expect(orders.find).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("acknowledges a verified notification that does not belong to a Master order without touching modern payments", async () => {
    const { service, prisma } = harness({ found: false });
    const payload = notification();

    await expect(service.handle(payload, Buffer.from(JSON.stringify(payload)), {})).resolves.toEqual({
      received: true,
      verified: true,
      matched: false,
      duplicate: false,
      stateChanged: false,
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("records a verified SALE_APPROVED event and reports a Master state transition", async () => {
    const { service, tx } = harness();
    const payload = notification("SALE_APPROVED");

    await expect(service.handle(payload, Buffer.from(JSON.stringify(payload)), {})).resolves.toEqual({
      received: true,
      verified: true,
      matched: true,
      duplicate: false,
      stateChanged: true,
    });
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
  });

  it("deduplicates a retried Bold notification by notification id before applying another transition", async () => {
    const { service, tx } = harness({ duplicate: true });
    const payload = notification("SALE_APPROVED");

    await expect(service.handle(payload, Buffer.from(JSON.stringify(payload)), {})).resolves.toMatchObject({
      matched: true,
      duplicate: true,
      stateChanged: false,
    });
    expect(tx.$executeRaw).not.toHaveBeenCalled();
  });

  it("does not regress a provider-confirmed order when a later SALE_REJECTED event arrives", async () => {
    const { service } = harness({ lockedLegacyState: "PENDING_WRITE_BRIDGE" });
    const payload = notification("SALE_REJECTED");

    await expect(service.handle(payload, Buffer.from(JSON.stringify(payload)), {})).resolves.toMatchObject({
      matched: true,
      duplicate: false,
      stateChanged: false,
    });
  });

  it("fails closed on a different Bold transaction id for the same Master reference", async () => {
    const { service } = harness({ existingTransactionId: "ANOTHER-BOLD-PAYMENT" });
    const payload = notification("SALE_APPROVED");

    await expect(service.handle(payload, Buffer.from(JSON.stringify(payload)), {})).resolves.toMatchObject({
      matched: true,
      duplicate: false,
      stateChanged: false,
    });
  });

  it("treats a verified VOID_APPROVED before legacy apply as a state-changing cancellation", async () => {
    const { service } = harness({ lockedLegacyState: "PENDING_WRITE_BRIDGE" });
    const payload = notification("VOID_APPROVED");

    await expect(service.handle(payload, Buffer.from(JSON.stringify(payload)), {})).resolves.toMatchObject({
      matched: true,
      duplicate: false,
      stateChanged: true,
    });
  });

  it("never auto-reverses legacy when a VOID_APPROVED arrives after APPLIED", async () => {
    const { service } = harness({ lockedLegacyState: "APPLIED" });
    const payload = notification("VOID_APPROVED");

    await expect(service.handle(payload, Buffer.from(JSON.stringify(payload)), {})).resolves.toMatchObject({
      matched: true,
      duplicate: false,
      stateChanged: false,
    });
  });
});
