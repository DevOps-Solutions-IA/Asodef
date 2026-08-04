import { BOLD_INTENT_STATUSES, BOLD_PAYMENT_STATUSES, isKnownBoldIntentStatus, isKnownBoldPaymentStatus } from "./bold-status";

describe("Bold status vocabularies (US-022 acceptance criteria, copied verbatim)", () => {
  it("has exactly the documented intent statuses", () => {
    expect(BOLD_INTENT_STATUSES).toEqual(["ACTIVE", "PROCESSING", "PENDING", "DISABLED", "PAID", "EXPIRED"]);
  });

  it("has exactly the documented payment/attempt statuses", () => {
    expect(BOLD_PAYMENT_STATUSES).toEqual(["APPROVED", "REJECTED", "RUNNING", "PROCESSING", "PENDING"]);
  });

  it("isKnownBoldIntentStatus recognizes every documented value and rejects unknowns", () => {
    for (const status of BOLD_INTENT_STATUSES) {
      expect(isKnownBoldIntentStatus(status)).toBe(true);
    }
    expect(isKnownBoldIntentStatus("SOMETHING_NEW_BOLD_ADDED")).toBe(false);
  });

  it("isKnownBoldPaymentStatus recognizes every documented value and rejects unknowns", () => {
    for (const status of BOLD_PAYMENT_STATUSES) {
      expect(isKnownBoldPaymentStatus(status)).toBe(true);
    }
    expect(isKnownBoldPaymentStatus("SOMETHING_NEW_BOLD_ADDED")).toBe(false);
  });
});
