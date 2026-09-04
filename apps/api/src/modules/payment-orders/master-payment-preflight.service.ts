import { Injectable } from "@nestjs/common";
import { MasterQueryService } from "../master/application/master-query.service";
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

function decimalToCents(value: string | null): number | null {
  if (!value) return null;
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const cents = Math.round(amount * 100);
  return Number.isSafeInteger(cents) ? cents : null;
}

function parseMasterDate(value: string | null): Date | null {
  if (!value) return null;
  const day = /^(\d{4}-\d{2}-\d{2})/.exec(value)?.[1];
  const date = new Date(day ? `${day}T12:00:00.000Z` : value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Revalidates an opaque /pagos Master selection against the read-only Master
 * immediately before any future payment-order persistence. Nothing from the
 * browser token is trusted as financial state: contract ownership, current
 * payable-installment membership, balance and due date are all read again.
 */
@Injectable()
export class MasterPaymentPreflightService {
  constructor(
    private readonly master: MasterQueryService,
    private readonly tokens: MasterPaymentSelectionTokenService,
  ) {}

  async verify(token: string): Promise<VerifiedMasterPaymentSource | null> {
    const selection = this.tokens.verify(token);
    if (!selection) return null;

    try {
      const person = await this.master.findPersonByDocument(selection.personId);
      if (!person || person.personId !== selection.personId) return null;

      const contracts = await this.master.getContractsByPerson(person.personId);
      const contract = contracts.find((candidate) => candidate.contractId === selection.contractId);
      if (!contract) return null;

      const installments = await this.master.getOutstandingInstallments(contract.contractId);
      const installment = installments.find((candidate) => candidate.installmentId === selection.installmentId);
      if (!installment) return null;

      const amountCents = decimalToCents(installment.balance);
      const dueDate = parseMasterDate(installment.dueDate);
      const document = person.document?.trim() || person.personId;
      if (amountCents === null || dueDate === null || !document) return null;

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
        status: payableInstallmentStatus(installment),
      };
    } catch {
      return null;
    }
  }
}
