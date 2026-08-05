import { Inject, Injectable, Logger } from "@nestjs/common";
import { BOLD_TRANSPORT, type BoldTransport } from "./bold-transport.interface";
import type {
  CreatePaymentInput,
  CreatePaymentResult,
  CreateRefundInput,
  CreateRefundResult,
  PaymentProvider,
  PaymentStatusResult,
  ValidateNotificationInput,
  ValidateNotificationResult,
} from "./payment-provider.interface";
import { isKnownBoldPaymentStatus } from "./bold-status";

/**
 * PaymentProvider implementation for Bold (US-022). Orchestrates Bold's
 * documented two-step flow - create a payment-intent, then create the
 * actual payment against it - behind the single createPayment() call
 * the interface exposes. Delegates all HTTP work to an injected
 * BoldTransport (MockBoldTransport or HttpBoldTransport, selected by
 * BOLD_MODE - see bold-transport.provider.ts), so this class itself
 * never knows or cares whether calls are real or mocked.
 */
@Injectable()
export class BoldPaymentProvider implements PaymentProvider {
  private readonly logger = new Logger(BoldPaymentProvider.name);

  constructor(@Inject(BOLD_TRANSPORT) private readonly transport: BoldTransport) {}

  async createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult> {
    const intent = await this.transport.createPaymentIntent({
      reference_id: input.publicReference,
      amount: { currency: input.currency, total_amount: input.amountCents },
    });

    const payment = await this.transport.createPayment(input.publicReference);

    if (!isKnownBoldPaymentStatus(payment.status)) {
      // Never silently reinterpret an unknown status as success/failure -
      // preserved as-is for diagnostics, logged structurally, and left
      // for the caller (a later story's status mapping) to treat as a
      // safe pending/review state rather than APPROVED.
      this.logger.warn(
        `Unknown Bold payment status "${payment.status}" for reference_id ${input.publicReference}`,
        BoldPaymentProvider.name,
      );
    }

    return { status: payment.status, raw: { intent, payment } };
  }

  async getPaymentStatus(publicReference: string): Promise<PaymentStatusResult> {
    const payment = await this.transport.getPayment(publicReference);

    if (!isKnownBoldPaymentStatus(payment.status)) {
      this.logger.warn(`Unknown Bold payment status "${payment.status}" for reference_id ${publicReference}`, BoldPaymentProvider.name);
    }

    return { status: payment.status, raw: payment };
  }

  /**
   * Always returns verified: false in Phase 1 - Bold's webhook
   * signature header format could not be confirmed from public docs
   * (PRD openQuestions: "webhook-specific page returned 404"). Per the
   * PRD's own rule, an unverified event must still be logged/stored for
   * later reconciliation, never silently dropped, and must never alone
   * drive an APPROVED transition - that enforcement belongs to the
   * story that actually processes webhooks; this method only reports
   * the (always-false, for now) verification outcome honestly.
   */
  validateNotification(input: ValidateNotificationInput): Promise<ValidateNotificationResult> {
    this.logger.warn(
      "Bold webhook signature validation is unverified (signature header format not confirmed from public docs) - treating as unverified, not rejecting",
      BoldPaymentProvider.name,
    );
    return Promise.resolve({ verified: false, raw: input.payload });
  }

  /**
   * US-056: delegates to the injected transport, same as every other
   * method - MockBoldTransport implements this (a synthetic mock-mode
   * simulation), HttpBoldTransport deliberately does not (no real Bold
   * refund endpoint is documented anywhere in this project's approved
   * sources - per "do not invent endpoint paths", real mode still
   * refuses rather than guessing one).
   */
  async createRefund(input: CreateRefundInput): Promise<CreateRefundResult> {
    if (!this.transport.createRefund) {
      throw new Error("BoldPaymentProvider.createRefund is not implemented for this transport: no Bold refund endpoint is documented in approved project sources");
    }
    const result = await this.transport.createRefund(input.providerReferenceId, input.amountCents);

    if (!isKnownBoldPaymentStatus(result.status)) {
      this.logger.warn(`Unknown Bold refund status "${result.status}" for reference_id ${input.providerReferenceId}`, BoldPaymentProvider.name);
    }

    return { status: result.status, raw: result };
  }
}
