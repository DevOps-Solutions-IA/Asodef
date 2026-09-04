import type { MasterPaymentQuoteService } from "./master-payment-quote.service";
import { MasterConfirmedPaymentService } from "./master-confirmed-payment.service";
import type { MasterPaymentApplicationPort } from "../ports/master-payment-application.port";

const confirmed = {
  personId: "123456789",
  contractId: "100",
  installmentId: "I-1",
  amountCents: 750000,
  currency: "COP" as const,
  paymentReference: "provider-reference-test",
  idempotencyKey: "provider-event-test",
};

function serviceWith(quoteResult: unknown, applicationResult: unknown = { status: "NOT_CONFIGURED" }) {
  const quotes = { quote: jest.fn(async () => quoteResult) } as unknown as jest.Mocked<MasterPaymentQuoteService>;
  const application = { applyConfirmed: jest.fn(async () => applicationResult) } as unknown as jest.Mocked<MasterPaymentApplicationPort>;
  return { service: new MasterConfirmedPaymentService(quotes, application), quotes, application };
}

describe("MasterConfirmedPaymentService", () => {
  it("revalidates the exact Master amount before invoking the write port", async () => {
    const { service, application } = serviceWith({
      status: "VERIFIED",
      data: { amountCents: 750000 },
    });

    await expect(service.apply(confirmed)).resolves.toEqual({ status: "NOT_CONFIGURED" });
    expect(application.applyConfirmed).toHaveBeenCalledWith(confirmed);
  });

  it("rejects a stale checkout when the Master balance changed", async () => {
    const { service, application } = serviceWith({
      status: "VERIFIED",
      data: { amountCents: 650000 },
    });

    await expect(service.apply(confirmed)).resolves.toEqual({ status: "REJECTED", code: "AMOUNT_CHANGED" });
    expect(application.applyConfirmed).not.toHaveBeenCalled();
  });

  it("rejects when the installment is no longer in the certified payable set", async () => {
    const { service, application } = serviceWith({ status: "REJECTED", reason: "INSTALLMENT_NOT_PAYABLE" });

    await expect(service.apply(confirmed)).resolves.toEqual({ status: "REJECTED", code: "SELECTION_NOT_PAYABLE" });
    expect(application.applyConfirmed).not.toHaveBeenCalled();
  });

  it("rejects invalid or non-positive amounts before any Master lookup", async () => {
    const { service, quotes, application } = serviceWith({ status: "REJECTED", reason: "SUBJECT_NOT_FOUND" });

    await expect(service.apply({ ...confirmed, amountCents: 0 })).resolves.toEqual({ status: "REJECTED", code: "INVALID_AMOUNT" });
    expect(quotes.quote).not.toHaveBeenCalled();
    expect(application.applyConfirmed).not.toHaveBeenCalled();
  });
});
