import { DisabledMasterPaymentApplicationService } from "./disabled-master-payment-application.service";

describe("DisabledMasterPaymentApplicationService", () => {
  it("fails closed without performing any legacy operation", async () => {
    const service = new DisabledMasterPaymentApplicationService();

    await expect(service.applyConfirmed({
      personId: "123456789",
      contractId: "100",
      installmentId: "I-1",
      amountCents: 750000,
      currency: "COP",
      paymentReference: "provider-reference-test",
      idempotencyKey: "provider-event-test",
    })).resolves.toEqual({ status: "NOT_CONFIGURED" });
  });
});
