export const MASTER_PAYMENT_APPLICATION_PORT = Symbol("MASTER_PAYMENT_APPLICATION_PORT");

/**
 * Trusted backend command for applying money that has already been confirmed by
 * the payment provider. This is intentionally NOT a browser/self-service DTO.
 *
 * The legacy adapter must treat idempotencyKey as a hard business invariant:
 * retrying the same confirmed provider event must never create a second legacy
 * payment. No direct Firebird SQL surface is exposed by this port.
 */
export interface ConfirmedMasterPaymentApplication {
  personId: string;
  contractId: string;
  installmentId: string;
  amountCents: number;
  currency: "COP";
  paymentReference: string;
  idempotencyKey: string;
}

export type MasterPaymentApplicationResult =
  | { status: "APPLIED" }
  | { status: "NOT_CONFIGURED" }
  | { status: "UNAVAILABLE"; retryable: boolean }
  | { status: "REJECTED"; code: string };

export interface MasterPaymentApplicationPort {
  applyConfirmed(input: ConfirmedMasterPaymentApplication): Promise<MasterPaymentApplicationResult>;
}
