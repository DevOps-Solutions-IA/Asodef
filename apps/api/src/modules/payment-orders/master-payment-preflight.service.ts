import { Injectable } from "@nestjs/common";
import { MasterPaymentQuoteService } from "../master/application/master-payment-quote.service";
import { payableInstallmentStatus } from "../master/domain/master-payable-installments";
import { MasterPaymentSelectionTokenService } from "./master-payment-selection-token.service";

export interface VerifiedMasterPaymentSource {
  personId: string;
  document: string;
  documentType: string | null;
  fullName: string;
  contractId: string;
  installmentId: string;
  concept: string;
  amountCents: number;
  currency: "COP";
  dueDate: Date;
  status: string;
}

/**
 * Revalidates an opaque /pagos Master selection against the single certified
 * Master payment-quote authority immediately before any future payment-order
 * persistence. Nothing from the browser token is trusted as financial state.
 */
@Injectable()
export class MasterPaymentPreflightService {
  constructor(
    private readonly quotes: MasterPaymentQuoteService,
    private readonly tokens: MasterPaymentSelectionTokenService,
  ) {}

  async verify(token: string): Promise<VerifiedMasterPaymentSource | null> {
    const selection = this.tokens.verify(token);
    if (!selection) return null;

    try {
      const result = await this.quotes.quote(selection.personId, selection.contractId, selection.installmentId);
      if (result.status !== "VERIFIED") return null;

      const { person, contract, installment, amountCents, dueDate } = result.data;
      const document = person.document?.trim() || person.personId;
      const status = payableInstallmentStatus(installment);
      if (!document || !status) return null;

      return {
        personId: person.personId,
        document,
        documentType: person.documentType,
        fullName: [person.names, person.surnames].filter(Boolean).join(" ").trim() || "Afiliado ASODEF",
        contractId: contract.contractId,
        installmentId: installment.installmentId,
        concept: installment.installmentNumber === null ? "Cuota ASODEF" : `Cuota ${installment.installmentNumber}`,
        amountCents,
        currency: "COP",
        dueDate,
        status,
      };
    } catch {
      return null;
    }
  }
}
