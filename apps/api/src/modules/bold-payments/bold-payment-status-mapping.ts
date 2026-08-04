import { PaymentAttemptStatus, PaymentOrderStatus } from "@prisma/client";
import { isKnownBoldPaymentStatus } from "../payment-providers/bold-status";

/**
 * The single, exhaustive, unit-tested map from Bold's own payment
 * vocabulary (bold-status.ts, copied verbatim from the AC in US-022) to
 * ASODEF's own two internal status vocabularies. Every caller that
 * needs to react to a Bold status (this story's create/status
 * endpoints, and later US-026's webhook handler) goes through this
 * module - never re-implements the mapping inline.
 *
 * PaymentAttemptStatus has no RUNNING/PROCESSING member of its own
 * (see schema.prisma's own comment: an attempt either succeeds, fails,
 * or expires) - Bold's "still working on it" statuses (RUNNING,
 * PROCESSING, PENDING) all map to our own PENDING, which is also the
 * attempt's default value at creation. The AC's own example
 * ("...returns a PaymentAttempt in RUNNING/PROCESSING state...") refers
 * to Bold's raw status, preserved in PaymentTransaction.rawResponse -
 * not a distinct internal enum member that doesn't exist.
 */
export interface BoldStatusMappingResult {
  attemptStatus: PaymentAttemptStatus;
  orderStatus: PaymentOrderStatus;
  /** False for any Bold status outside BOLD_PAYMENT_STATUSES (US-022's
   * own confirmed vocabulary) - the caller must log this as an
   * operational anomaly and must never treat it as success. */
  isKnownBoldStatus: boolean;
}

const PENDING_RESULT: BoldStatusMappingResult = {
  attemptStatus: PaymentAttemptStatus.PENDING,
  orderStatus: PaymentOrderStatus.PROCESSING,
  isKnownBoldStatus: true,
};

export function mapBoldPaymentStatus(boldStatus: string): BoldStatusMappingResult {
  if (!isKnownBoldPaymentStatus(boldStatus)) {
    // Unknown Bold status: preserved as-is elsewhere (rawResponse), but
    // never mapped to anything but a safe, non-terminal, non-success
    // internal state here.
    return { ...PENDING_RESULT, isKnownBoldStatus: false };
  }

  switch (boldStatus) {
    case "APPROVED":
      return { attemptStatus: PaymentAttemptStatus.APPROVED, orderStatus: PaymentOrderStatus.APPROVED, isKnownBoldStatus: true };
    case "REJECTED":
      return { attemptStatus: PaymentAttemptStatus.REJECTED, orderStatus: PaymentOrderStatus.REJECTED, isKnownBoldStatus: true };
    case "RUNNING":
    case "PROCESSING":
    case "PENDING":
      return PENDING_RESULT;
  }
}

const ORDER_TERMINAL_STATUSES: readonly PaymentOrderStatus[] = [
  PaymentOrderStatus.APPROVED,
  PaymentOrderStatus.REJECTED,
  PaymentOrderStatus.FAILED,
  PaymentOrderStatus.EXPIRED,
  PaymentOrderStatus.CANCELLED,
  PaymentOrderStatus.REFUNDED,
  PaymentOrderStatus.PARTIALLY_REFUNDED,
];

const ATTEMPT_TERMINAL_STATUSES: readonly PaymentAttemptStatus[] = [
  PaymentAttemptStatus.APPROVED,
  PaymentAttemptStatus.REJECTED,
  PaymentAttemptStatus.FAILED,
  PaymentAttemptStatus.EXPIRED,
];

/**
 * Guards against exactly the invalid regressions the PRD calls out by
 * name (PAID/APPROVED -> PENDING, CANCELLED -> active, a confirmed
 * transaction silently overwritten by an unknown state). Once a order
 * or attempt has reached a terminal status, only a no-op (same status
 * again, e.g. an idempotent replay) is allowed - never a transition
 * back to a non-terminal or a different terminal status.
 */
export function canTransitionOrderStatus(current: PaymentOrderStatus, next: PaymentOrderStatus): boolean {
  if (current === next) return true;
  return !ORDER_TERMINAL_STATUSES.includes(current);
}

export function canTransitionAttemptStatus(current: PaymentAttemptStatus, next: PaymentAttemptStatus): boolean {
  if (current === next) return true;
  return !ATTEMPT_TERMINAL_STATUSES.includes(current);
}

export function isOrderStatusTerminal(status: PaymentOrderStatus): boolean {
  return ORDER_TERMINAL_STATUSES.includes(status);
}

export function isAttemptStatusTerminal(status: PaymentAttemptStatus): boolean {
  return ATTEMPT_TERMINAL_STATUSES.includes(status);
}
