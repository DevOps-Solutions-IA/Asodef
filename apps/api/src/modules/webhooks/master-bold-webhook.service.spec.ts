import { MasterBoldWebhookService } from "./master-bold-webhook.service";
import type { NormalizedBoldWebhookPayload } from "./bold-webhook-payload";

const payload = {
  id: "191850cb-00f8-4f64-aa5f-4975848e9428",
  type: "SALE_APPROVED",
  subject: "BOLD-PAYMENT-1",
  data: {
    payment_id: "BOLD-PAYMENT-1",
    metadata: { reference: "master-public-reference" },
  },
};

function normalized(type = "SALE_APPROVED"): NormalizedBoldWebhookPayload {
  return {
    format: "official",
    notificationId: payload.id,
    eventType: type,
    reference: "master-public-reference",
    providerStatus: type === "SALE_APPROVED" ? "APPROVED" : type === "SALE_REJECTED" ? "REJECTED" : null,
    transactionId: "BOLD-PAYMENT-1",
  };
}

async function settle(): Promise<void> {
  await new Promise((resolve) => setImmediate(resolve));
}

describe("MasterBoldWebhookService", () => {
  const order = { id: "7808ee2a-399b-4f4e-b124-e5735810cf86" };

  function harness(options?: {
    found?: boolean;
    duplicate?: boolean;
    legacyState?: string;
    transactionId?: string | null;
  }) {
    const orders = {
      find: jest.fn().mockResolvedValue((options?.found ?? true) ? order : null),
    };
    const tx = {
      $queryRaw: jest.fn()
        .mockResolvedValueOnce([{ id: order.id }])
        .mockResolvedValueOnce(options?.duplicate ? [] : [{ id: "event-id" }])
        .mockResolvedValueOnce([{
          provider_transaction_id: options?.transactionId ?? null,
          legacy_application_state: options?.legacyState ?? "NOT_APPLIED",
        }]),
      $executeRaw: jest.fn().mockResolvedValue(1),
    };
    const prisma = {
      $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    };
    const service = new MasterBoldWebhookService(prisma as never, orders as never);
    return { service, prisma, orders, tx };
  }

  it("returns false for a reference that is not a Master order", async () => {
    const { service, prisma } = harness({ found: false });
    await expect(service.receive(payload, normalized(), true)).resolves.toBe(false);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("deduplicates a retried notification by Bold notification id", async () => {
    const { service, tx } = harness({ duplicate: true });
    await expect(service.receive(payload, normalized(), true)).resolves.toBe(true);
    await settle();
    expect(tx.$executeRaw).not.toHaveBeenCalled();
  });

  it("persists and asynchronously processes a verified SALE_APPROVED Master notification", async () => {
    const { service, tx } = harness();
    await expect(service.receive(payload, normalized("SALE_APPROVED"), true)).resolves.toBe(true);
    await settle();
    expect(tx.$executeRaw).toHaveBeenCalledTimes(2);
  });

  it("stores an unverified Master notification for reconciliation without applying a provider transition", async () => {
    const { service, tx } = harness();
    await expect(service.receive(payload, normalized("SALE_APPROVED"), false)).resolves.toBe(true);
    await settle();
    expect(tx.$executeRaw).toHaveBeenCalledTimes(2);
  });

  it("does not regress a confirmed Master payment on SALE_REJECTED", async () => {
    const { service, tx } = harness({ legacyState: "PENDING_WRITE_BRIDGE" });
    await expect(service.receive(payload, normalized("SALE_REJECTED"), true)).resolves.toBe(true);
    await settle();
    expect(tx.$executeRaw).toHaveBeenCalledTimes(2);
  });

  it("fails closed on a different transaction id for the same Master reference", async () => {
    const { service, tx } = harness({ transactionId: "ANOTHER-BOLD-PAYMENT" });
    await expect(service.receive(payload, normalized("SALE_APPROVED"), true)).resolves.toBe(true);
    await settle();
    expect(tx.$executeRaw).toHaveBeenCalledTimes(2);
  });

  it("never auto-reverses AdaSys when VOID_APPROVED arrives after legacy APPLIED", async () => {
    const { service, tx } = harness({ legacyState: "APPLIED" });
    await expect(service.receive(payload, normalized("VOID_APPROVED"), true)).resolves.toBe(true);
    await settle();
    expect(tx.$executeRaw).toHaveBeenCalledTimes(2);
  });
});
