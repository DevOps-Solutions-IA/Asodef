import { Logger } from "@nestjs/common";
import { BoldPaymentProvider } from "./bold-payment-provider.service";
import { MockBoldTransport } from "./mock-bold.transport";
import type { BoldTransport } from "./bold-transport.interface";

describe("BoldPaymentProvider (mock mode)", () => {
  let mockTransport: MockBoldTransport;
  let provider: BoldPaymentProvider;

  beforeEach(() => {
    mockTransport = new MockBoldTransport();
    provider = new BoldPaymentProvider(mockTransport);
  });

  it("Example (AC): createPayment() in mock mode returns a well-formed CreatePaymentResult with no outbound HTTP request", async () => {
    const fetchSpy = jest.spyOn(global, "fetch");

    const result = await provider.createPayment({ publicReference: "pub-ref-1", amountCents: 5_000_000, currency: "COP" });

    expect(result.status).toBe("APPROVED");
    expect(result.raw).toEqual({
      intent: { status: "ACTIVE", reference_id: "pub-ref-1", amount: { currency: "COP", total_amount: 5_000_000 } },
      payment: { status: "APPROVED", reference_id: "pub-ref-1" },
    });
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("maps a rejected mock outcome through without altering the raw status", async () => {
    mockTransport.setNextPaymentStatus("REJECTED");
    const result = await provider.createPayment({ publicReference: "pub-ref-2", amountCents: 1_000_000, currency: "COP" });
    expect(result.status).toBe("REJECTED");
  });

  it("logs (never throws) on an unknown provider status, preserving it as-is for diagnostics", async () => {
    mockTransport.setNextPaymentStatus("SOME_FUTURE_BOLD_STATUS");
    const warnSpy = jest.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);

    const result = await provider.createPayment({ publicReference: "pub-ref-3", amountCents: 1, currency: "COP" });

    expect(result.status).toBe("SOME_FUTURE_BOLD_STATUS");
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("getPaymentStatus returns the mapped-through status and raw payload", async () => {
    await provider.createPayment({ publicReference: "pub-ref-4", amountCents: 2_000_000, currency: "COP" });
    const status = await provider.getPaymentStatus("pub-ref-4");
    expect(status).toEqual({ status: "APPROVED", raw: { status: "APPROVED", reference_id: "pub-ref-4" } });
  });

  it("validateNotification always returns verified: false in Phase 1 - Bold's signature format isn't confirmed", async () => {
    const payload = { event_type: "payment.approved", transaction_id: "tx-1" };
    const result = await provider.validateNotification({ payload, headers: {} });

    expect(result.verified).toBe(false);
    expect(result.raw).toBe(payload);
  });

  it("US-056: createRefund succeeds in mock mode for an already-created payment, with no outbound HTTP request", async () => {
    await provider.createPayment({ publicReference: "pub-ref-refund", amountCents: 3_000_000, currency: "COP" });
    const fetchSpy = jest.spyOn(global, "fetch");

    const result = await provider.createRefund({ providerReferenceId: "pub-ref-refund", amountCents: 1_000_000, reason: "test" });

    expect(result.status).toBe("APPROVED");
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("createRefund throws rather than inventing an undocumented Bold refund endpoint when the transport doesn't implement it (real HttpBoldTransport's own behavior)", async () => {
    // A minimal transport double implementing only the 3 required
    // BoldTransport methods, deliberately omitting createRefund -
    // simulates HttpBoldTransport, which has no createRefund method at
    // all. BoldPaymentProvider must still refuse cleanly.
    const transportWithoutRefund: BoldTransport = {
      createPaymentIntent: mockTransport.createPaymentIntent.bind(mockTransport),
      createPayment: mockTransport.createPayment.bind(mockTransport),
      getPayment: mockTransport.getPayment.bind(mockTransport),
    };
    const providerWithoutRefund = new BoldPaymentProvider(transportWithoutRefund);

    await expect(
      providerWithoutRefund.createRefund({ providerReferenceId: "ref-1", amountCents: 1000, reason: "test" }),
    ).rejects.toThrow(/not implemented/);
  });
});
