import type { PaymentProvider } from "../payment-providers/payment-provider.interface";
import type { MasterPaymentOrdersService, MasterPaymentOrderRow } from "../payment-orders/master-payment-orders.service";
import { MasterBoldPaymentsService } from "./master-bold-payments.service";

function order(overrides: Partial<MasterPaymentOrderRow> = {}): MasterPaymentOrderRow {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    public_reference: "master-public-reference",
    subject_ref: "1012345678",
    full_name: "Ana Pérez",
    document_type: "CC",
    masked_document: "••••••5678",
    contract_id: "900001",
    installment_id: "8",
    concept: "Cuota 8",
    amount_cents: 5_000_000,
    currency: "COP",
    due_date: new Date("2026-09-10T12:00:00.000Z"),
    status: "PENDING",
    application_key: "22222222-2222-4222-8222-222222222222",
    legacy_application_state: "NOT_APPLIED",
    provider_link_id: null,
    provider_checkout_url: null,
    provider_status: null,
    provider_transaction_id: null,
    provider_raw: null,
    reconciliation_result: null,
    master_receipt: null,
    master_document: null,
    failure_code: null,
    terms_version_id: "33333333-3333-4333-8333-333333333333",
    expires_at: new Date(Date.now() + 60_000),
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  };
}

function harness() {
  const orders = {
    find: jest.fn(),
    revalidateForCheckout: jest.fn(async () => undefined),
    claimProviderCreate: jest.fn(),
    recordProviderResult: jest.fn(async () => undefined),
    markProviderCreateUnknown: jest.fn(async () => undefined),
  } as unknown as MasterPaymentOrdersService;
  const provider = {
    createPayment: jest.fn(),
    getPaymentStatus: jest.fn(),
    validateNotification: jest.fn(),
  } as unknown as PaymentProvider;
  return { service: new MasterBoldPaymentsService(orders, provider), orders, provider };
}

describe("MasterBoldPaymentsService", () => {
  it("replays a persisted provider result without creating a second Bold payment", async () => {
    const { service, orders, provider } = harness();
    const existing = order({
      status: "PROCESSING",
      provider_status: "PENDING",
      provider_raw: { next: "persisted" },
    });
    (orders.find as jest.Mock).mockResolvedValue(existing);

    await expect(service.create(existing.public_reference)).resolves.toMatchObject({
      publicReference: existing.public_reference,
      providerNextAction: { next: "persisted" },
    });
    expect(provider.createPayment).not.toHaveBeenCalled();
    expect(orders.claimProviderCreate).not.toHaveBeenCalled();
  });

  it("sends Bold only the immutable server-side Master snapshot amount", async () => {
    const { service, orders, provider } = harness();
    const pending = order();
    const claimed = order({ status: "PROCESSING", provider_status: "CREATE_CLAIMED" });
    const persisted = order({ status: "PROCESSING", provider_status: "PENDING", provider_raw: { next: "provider" } });
    (orders.find as jest.Mock)
      .mockResolvedValueOnce(pending)
      .mockResolvedValueOnce(persisted);
    (orders.claimProviderCreate as jest.Mock).mockResolvedValue(claimed);
    (provider.createPayment as jest.Mock).mockResolvedValue({ status: "PENDING", raw: { next: "provider" } });

    await service.create(pending.public_reference);

    expect(orders.revalidateForCheckout).toHaveBeenCalledWith(pending);
    expect(provider.createPayment).toHaveBeenCalledTimes(1);
    expect(provider.createPayment).toHaveBeenCalledWith({
      publicReference: claimed.public_reference,
      amountCents: claimed.amount_cents,
      currency: "COP",
    });
  });

  it("fails closed after an uncertain provider create and never issues an automatic second create", async () => {
    const { service, orders, provider } = harness();
    const pending = order();
    const claimed = order({ status: "PROCESSING", provider_status: "CREATE_CLAIMED" });
    (orders.find as jest.Mock).mockResolvedValueOnce(pending);
    (orders.claimProviderCreate as jest.Mock).mockResolvedValue(claimed);
    (provider.createPayment as jest.Mock).mockRejectedValueOnce(new Error("timeout after send"));

    await expect(service.create(pending.public_reference)).rejects.toThrow("conciliación");
    expect(orders.markProviderCreateUnknown).toHaveBeenCalledWith(claimed.id);
    expect(provider.createPayment).toHaveBeenCalledTimes(1);

    (orders.find as jest.Mock).mockResolvedValueOnce(order({ status: "PROCESSING", provider_status: "CREATE_UNKNOWN" }));
    await expect(service.create(pending.public_reference)).rejects.toThrow("conciliación");
    expect(provider.createPayment).toHaveBeenCalledTimes(1);
  });

  it("keeps a Bold APPROVED Master payment PROCESSING until the legacy write bridge applies it", async () => {
    const { service, orders, provider } = harness();
    const before = order({ status: "PROCESSING", provider_status: "PENDING" });
    const after = order({
      status: "PROCESSING",
      provider_status: "APPROVED",
      provider_raw: { status: "APPROVED" },
      legacy_application_state: "PENDING_WRITE_BRIDGE",
    });
    (orders.find as jest.Mock)
      .mockResolvedValueOnce(before)
      .mockResolvedValueOnce(after);
    (provider.getPaymentStatus as jest.Mock).mockResolvedValue({ status: "APPROVED", raw: { status: "APPROVED" } });

    const response = await service.getStatus(before.public_reference);

    expect(orders.recordProviderResult).toHaveBeenCalledWith(before.id, expect.objectContaining({
      providerStatus: "APPROVED",
      orderStatus: "PROCESSING",
      providerConfirmed: true,
      eventType: "payment.status",
    }));
    expect(response).toMatchObject({
      orderStatus: "PROCESSING",
      attemptStatus: "APPROVED",
      receiptAvailable: false,
      source: "master",
      legacyApplicationStatus: "PENDING_WRITE_BRIDGE",
    });
  });
});
