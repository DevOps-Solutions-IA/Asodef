import { Inject, Injectable } from "@nestjs/common";
import { MasterPaymentQuoteService } from "./master-payment-quote.service";
import {
  MASTER_PAYMENT_APPLICATION_PORT,
  type MasterPaymentApplicationPort,
  type MasterPaymentApplicationResult,
} from "../ports/master-payment-application.port";

export interface ConfirmedMasterPayment {
  personId: string;
  contractId: string;
  installmentId: string;
  amountCents: number;
  currency: "COP";
  paymentReference: string;
  idempotencyKey: string;
}

export type ConfirmedMasterPaymentResult =
  | MasterPaymentApplicationResult
  | { status: "REJECTED"; code: "SELECTION_NOT_PAYABLE" | "AMOUNT_CHANGED" | "INVALID_AMOUNT" };

/**
 * Backend-only coordination point between a trusted payment-provider
 * confirmation and the future AdaSys write adapter.
 *
 * It deliberately re-reads the certified Master payable set immediately before
 * invoking the write port. The browser cannot select the amount that gets
 * applied and a stale checkout cannot silently write a different balance.
 */
@Injectable()
export class MasterConfirmedPaymentService {
  constructor(
    private readonly quotes: MasterPaymentQuoteService,
    @Inject(MASTER_PAYMENT_APPLICATION_PORT)
    private readonly application: MasterPaymentApplicationPort,
  ) {}

  async apply(input: ConfirmedMasterPayment): Promise<ConfirmedMasterPaymentResult> {
    if (!Number.isSafeInteger(input.amountCents) || input.amountCents <= 0 || input.currency !== "COP") {
      return { status: "REJECTED", code: "INVALID_AMOUNT" };
    }

    const quote = await this.quotes.quote(input.personId, input.contractId, input.installmentId);
    if (quote.status !== "VERIFIED") {
      return { status: "REJECTED", code: "SELECTION_NOT_PAYABLE" };
    }
    if (quote.data.amountCents !== input.amountCents) {
      return { status: "REJECTED", code: "AMOUNT_CHANGED" };
    }

    return this.application.applyConfirmed(input);
  }
}
