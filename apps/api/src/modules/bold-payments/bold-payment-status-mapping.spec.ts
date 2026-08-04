import { PaymentAttemptStatus, PaymentOrderStatus } from "@prisma/client";
import {
  canTransitionAttemptStatus,
  canTransitionOrderStatus,
  isAttemptStatusTerminal,
  isOrderStatusTerminal,
  mapBoldPaymentStatus,
} from "./bold-payment-status-mapping";

describe("mapBoldPaymentStatus (exhaustive, PRD's own BOLD_PAYMENT_STATUSES vocabulary)", () => {
  it("maps APPROVED to APPROVED/APPROVED", () => {
    expect(mapBoldPaymentStatus("APPROVED")).toEqual({
      attemptStatus: PaymentAttemptStatus.APPROVED,
      orderStatus: PaymentOrderStatus.APPROVED,
      isKnownBoldStatus: true,
    });
  });

  it("maps REJECTED to REJECTED/REJECTED", () => {
    expect(mapBoldPaymentStatus("REJECTED")).toEqual({
      attemptStatus: PaymentAttemptStatus.REJECTED,
      orderStatus: PaymentOrderStatus.REJECTED,
      isKnownBoldStatus: true,
    });
  });

  it.each(["RUNNING", "PROCESSING", "PENDING"])("maps Bold's in-flight status %s to PENDING/PROCESSING", (status) => {
    expect(mapBoldPaymentStatus(status)).toEqual({
      attemptStatus: PaymentAttemptStatus.PENDING,
      orderStatus: PaymentOrderStatus.PROCESSING,
      isKnownBoldStatus: true,
    });
  });

  it("maps an unknown/unrecognized Bold status to a safe non-success PENDING/PROCESSING state, flagged unknown", () => {
    expect(mapBoldPaymentStatus("SOME_FUTURE_STATUS")).toEqual({
      attemptStatus: PaymentAttemptStatus.PENDING,
      orderStatus: PaymentOrderStatus.PROCESSING,
      isKnownBoldStatus: false,
    });
  });
});

describe("canTransitionOrderStatus / canTransitionAttemptStatus (invalid regression protection)", () => {
  it("allows PENDING -> PROCESSING -> APPROVED (the normal happy path)", () => {
    expect(canTransitionOrderStatus(PaymentOrderStatus.PENDING, PaymentOrderStatus.PROCESSING)).toBe(true);
    expect(canTransitionOrderStatus(PaymentOrderStatus.PROCESSING, PaymentOrderStatus.APPROVED)).toBe(true);
  });

  it("allows a no-op transition to the same status (idempotent replay)", () => {
    expect(canTransitionOrderStatus(PaymentOrderStatus.APPROVED, PaymentOrderStatus.APPROVED)).toBe(true);
    expect(canTransitionAttemptStatus(PaymentAttemptStatus.APPROVED, PaymentAttemptStatus.APPROVED)).toBe(true);
  });

  it("blocks APPROVED -> PENDING (PRD's own named invalid regression)", () => {
    expect(canTransitionOrderStatus(PaymentOrderStatus.APPROVED, PaymentOrderStatus.PENDING)).toBe(false);
  });

  it("blocks CANCELLED -> PROCESSING (a cancelled order must never become active again)", () => {
    expect(canTransitionOrderStatus(PaymentOrderStatus.CANCELLED, PaymentOrderStatus.PROCESSING)).toBe(false);
  });

  it("blocks a confirmed APPROVED order from being overwritten by an unknown/PROCESSING status", () => {
    expect(canTransitionOrderStatus(PaymentOrderStatus.APPROVED, PaymentOrderStatus.PROCESSING)).toBe(false);
  });

  it("blocks a terminal PaymentAttempt (APPROVED) from regressing to PENDING", () => {
    expect(canTransitionAttemptStatus(PaymentAttemptStatus.APPROVED, PaymentAttemptStatus.PENDING)).toBe(false);
  });

  it("blocks REJECTED -> APPROVED at the attempt level (no silent flip after rejection)", () => {
    expect(canTransitionAttemptStatus(PaymentAttemptStatus.REJECTED, PaymentAttemptStatus.APPROVED)).toBe(false);
  });
});

describe("isOrderStatusTerminal / isAttemptStatusTerminal", () => {
  it.each([
    PaymentOrderStatus.APPROVED,
    PaymentOrderStatus.REJECTED,
    PaymentOrderStatus.FAILED,
    PaymentOrderStatus.EXPIRED,
    PaymentOrderStatus.CANCELLED,
    PaymentOrderStatus.REFUNDED,
    PaymentOrderStatus.PARTIALLY_REFUNDED,
  ])("treats order status %s as terminal", (status) => {
    expect(isOrderStatusTerminal(status)).toBe(true);
  });

  it.each([PaymentOrderStatus.DRAFT, PaymentOrderStatus.PENDING, PaymentOrderStatus.PROCESSING])(
    "treats order status %s as non-terminal",
    (status) => {
      expect(isOrderStatusTerminal(status)).toBe(false);
    },
  );

  it.each([PaymentAttemptStatus.APPROVED, PaymentAttemptStatus.REJECTED, PaymentAttemptStatus.FAILED, PaymentAttemptStatus.EXPIRED])(
    "treats attempt status %s as terminal",
    (status) => {
      expect(isAttemptStatusTerminal(status)).toBe(true);
    },
  );

  it("treats attempt status PENDING as non-terminal", () => {
    expect(isAttemptStatusTerminal(PaymentAttemptStatus.PENDING)).toBe(false);
  });
});
