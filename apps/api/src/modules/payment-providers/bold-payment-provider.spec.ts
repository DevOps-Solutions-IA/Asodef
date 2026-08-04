import { Logger } from "@nestjs/common";
import { BoldPaymentProvider } from "./bold-payment-provider.service";
import { MockBoldTransport } from "./mock-bold.transport";

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

  it("createRefund throws rather than inventing an undocumented Bold refund endpoint", async () => {
    await expect(provider.createRefund({ providerReferenceId: "ref-1", amountCents: 1000, reason: "test" })).rejects.toThrow(
      /not implemented/,
    );
  });
});
