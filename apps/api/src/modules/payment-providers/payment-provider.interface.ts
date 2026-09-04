/**
 * Provider-agnostic payment interface (US-022 acceptance criteria -
 * method names copied verbatim: createPayment, getPaymentStatus,
 * validateNotification, optional createRefund). No Bold-specific
 * shape leaks through here - callers depend only on this interface.
 */

export interface CreatePaymentInput {
  publicReference: string;
  amountCents: number;
  currency: string;
}

export interface CreatePaymentResult {
  status: string;
  raw: unknown;
}

export interface PaymentStatusResult {
  status: string;
  raw: unknown;
}

export interface ValidateNotificationInput {
  payload: unknown;
  headers: Record<string, string | string[] | undefined>;
  /** Exact HTTP entity bytes. Provider signature validation must never
   * re-serialize `payload`, because JSON whitespace/property order is part
   * of the signed message. Undefined means the HTTP adapter did not preserve
   * the body and validation must fail closed. */
  rawBody?: Buffer;
}

export interface ValidateNotificationResult {
  /** True only after provider-specific cryptographic origin validation. */
  verified: boolean;
  raw: unknown;
}

export interface CreateRefundInput {
  providerReferenceId: string;
  amountCents: number;
  reason: string;
}

export interface CreateRefundResult {
  status: string;
  raw: unknown;
}

export interface PaymentProvider {
  createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult>;
  getPaymentStatus(publicReference: string): Promise<PaymentStatusResult>;
  validateNotification(input: ValidateNotificationInput): Promise<ValidateNotificationResult>;
  createRefund?(input: CreateRefundInput): Promise<CreateRefundResult>;
}

export const PAYMENT_PROVIDER = Symbol("PAYMENT_PROVIDER");
