import { computeWebhookIdempotencyKey } from "./webhook-idempotency-key";

describe("computeWebhookIdempotencyKey", () => {
  it("uses Bold's unique notification id for the current official payload", () => {
    const a = computeWebhookIdempotencyKey({ id: "notif-1", type: "SALE_APPROVED", data: { value: 1 } });
    const b = computeWebhookIdempotencyKey({ id: "notif-1", type: "SALE_APPROVED", data: { value: 2 } });
    expect(a).toBe("bold-notification:notif-1");
    expect(b).toBe(a);
  });

  it("produces the same fallback key for the same legacy payload regardless of key order", () => {
    const a = computeWebhookIdempotencyKey({ reference_id: "abc", status: "APPROVED" });
    const b = computeWebhookIdempotencyKey({ status: "APPROVED", reference_id: "abc" });
    expect(a).toBe(b);
  });

  it("produces different fallback keys for a different status on the same order", () => {
    const a = computeWebhookIdempotencyKey({ reference_id: "abc", status: "PROCESSING" });
    const b = computeWebhookIdempotencyKey({ reference_id: "abc", status: "APPROVED" });
    expect(a).not.toBe(b);
  });

  it("produces different fallback keys for different references with the same status", () => {
    const a = computeWebhookIdempotencyKey({ reference_id: "abc", status: "APPROVED" });
    const b = computeWebhookIdempotencyKey({ reference_id: "def", status: "APPROVED" });
    expect(a).not.toBe(b);
  });

  it("keeps the legacy fallback as a 64-character SHA-256 hex digest", () => {
    const key = computeWebhookIdempotencyKey({ reference_id: "abc", status: "APPROVED" });
    expect(key).toMatch(/^[a-f0-9]{64}$/);
  });
});
