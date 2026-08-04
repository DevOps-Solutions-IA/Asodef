/**
 * The raw Bold HTTP surface, separated from PaymentProvider's
 * business-facing contract exactly like MailTransport is separated
 * from NotificationService - BoldPaymentProvider (the business logic:
 * orchestrating intent-then-payment, wrapping results) is transport-
 * agnostic, and MockBoldTransport/HttpBoldTransport are the two
 * concrete implementations selected by BOLD_MODE.
 *
 * Field names mirror Bold's own documented request shape exactly
 * (snake_case, not camelCase) so the code is directly comparable to
 * the docs - this is an external API contract, not our own DB.
 * Response shapes only confirm the `status` field per the AC; every
 * other response field is untyped (the full raw object is returned)
 * since nothing else is documented.
 */

export interface BoldAmount {
  currency: string;
  total_amount: number;
}

export interface BoldCreatePaymentIntentRequest {
  reference_id: string;
  amount: BoldAmount;
}

/** Only `status` is a confirmed field name on any Bold response body -
 * everything else is passed through untyped. */
export interface BoldApiResponse {
  status: string;
  [key: string]: unknown;
}

export interface BoldTransport {
  /** POST /v1/payment-intent */
  createPaymentIntent(request: BoldCreatePaymentIntentRequest): Promise<BoldApiResponse>;
  /** POST /v1/payment */
  createPayment(referenceId: string): Promise<BoldApiResponse>;
  /** GET /v1/payment/{reference_id} */
  getPayment(referenceId: string): Promise<BoldApiResponse>;
}

/** DI token - BoldTransport is a type-only interface. */
export const BOLD_TRANSPORT = Symbol("BOLD_TRANSPORT");
