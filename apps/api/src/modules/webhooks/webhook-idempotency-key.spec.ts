import { computeWebhookIdempotencyKey } from "./webhook-idempotency-key";

describe("computeWebhookIdempotencyKey", () => {
  it("produces the same key for the same payload regardless of key order (a real retry)", () => {
    const a = computeWebhookIdempotencyKey({ reference_id: "abc", status: "APPROVED" });
    const b = computeWebhookIdempotencyKey({ status: "APPROVED", reference_id: "abc" });
    expect(a).toBe(b);
  });

  it("produces different keys for a different status on the same order (not a duplicate)", () => {
    const a = computeWebhookIdempotencyKey({ reference_id: "abc", status: "PROCESSING" });
    const b = computeWebhookIdempotencyKey({ reference_id: "abc", status: "APPROVED" });
    expect(a).not.toBe(b);
  });

  it("produces different keys for different reference_ids with the same status", () => {
    const a = computeWebhookIdempotencyKey({ reference_id: "abc", status: "APPROVED" });
    const b = computeWebhookIdempotencyKey({ reference_id: "def", status: "APPROVED" });
    expect(a).not.toBe(b);
  });

  it("is stable for nested objects regardless of nested key order", () => {
    const a = computeWebhookIdempotencyKey({ reference_id: "abc", status: "APPROVED", amount: { currency: "COP", total_amount: 100 } });
    const b = computeWebhookIdempotencyKey({ amount: { total_amount: 100, currency: "COP" }, status: "APPROVED", reference_id: "abc" });
    expect(a).toBe(b);
  });

  it("returns a 64-character hex sha256 digest", () => {
    const key = computeWebhookIdempotencyKey({ reference_id: "abc", status: "APPROVED" });
    expect(key).toMatch(/^[a-f0-9]{64}$/);
  });
});
