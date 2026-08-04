/**
 * Bold's own documented status vocabularies (US-022 acceptance
 * criteria, copied verbatim - not inferred). Two distinct enums for two
 * distinct Bold resources: a payment-intent's own lifecycle vs. an
 * individual payment/attempt's outcome. Neither is mapped to an
 * internal ASODEF status here - that mapping is a later story's job
 * (US-023's statusMap module) once PaymentOrder/PaymentAttempt context
 * exists; this module only knows Bold's own vocabulary.
 */

export const BOLD_INTENT_STATUSES = ["ACTIVE", "PROCESSING", "PENDING", "DISABLED", "PAID", "EXPIRED"] as const;
export type BoldIntentStatus = (typeof BOLD_INTENT_STATUSES)[number];

export const BOLD_PAYMENT_STATUSES = ["APPROVED", "REJECTED", "RUNNING", "PROCESSING", "PENDING"] as const;
export type BoldPaymentStatus = (typeof BOLD_PAYMENT_STATUSES)[number];

export function isKnownBoldIntentStatus(value: string): value is BoldIntentStatus {
  return (BOLD_INTENT_STATUSES as readonly string[]).includes(value);
}

export function isKnownBoldPaymentStatus(value: string): value is BoldPaymentStatus {
  return (BOLD_PAYMENT_STATUSES as readonly string[]).includes(value);
}
