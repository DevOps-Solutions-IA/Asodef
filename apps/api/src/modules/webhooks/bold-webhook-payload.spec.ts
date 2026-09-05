import { normalizeBoldWebhookPayload } from "./bold-webhook-payload";

describe("normalizeBoldWebhookPayload", () => {
  it("normalizes Bold's official SALE_APPROVED notification", () => {
    expect(normalizeBoldWebhookPayload({
      id: "notification-1",
      type: "SALE_APPROVED",
      subject: "payment-1",
      data: { payment_id: "payment-1", metadata: { reference: "public-ref" } },
    })).toEqual({
      format: "official",
      notificationId: "notification-1",
      eventType: "SALE_APPROVED",
      reference: "public-ref",
      providerStatus: "APPROVED",
      transactionId: "payment-1",
    });
  });

  it("keeps VOID_APPROVED auditable without inventing a modern payment status", () => {
    expect(normalizeBoldWebhookPayload({
      id: "notification-2",
      type: "VOID_APPROVED",
      data: { payment_id: "payment-2", metadata: { reference: "public-ref" } },
    })).toMatchObject({ providerStatus: null, eventType: "VOID_APPROVED" });
  });

  it("retains legacy reference_id/status only as compatibility input", () => {
    expect(normalizeBoldWebhookPayload({ reference_id: "legacy-ref", status: "PROCESSING" })).toEqual({
      format: "legacy",
      notificationId: null,
      eventType: "LEGACY_STATUS",
      reference: "legacy-ref",
      providerStatus: "PROCESSING",
      transactionId: null,
    });
  });

  it("rejects malformed shapes", () => {
    expect(normalizeBoldWebhookPayload({ type: "SALE_APPROVED" })).toBeNull();
    expect(normalizeBoldWebhookPayload(null)).toBeNull();
  });
});
