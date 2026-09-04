import { Injectable } from "@nestjs/common";
import { positiveMasterDecimalToCents } from "../domain/master-money";
import type { Contract, Installment, Person } from "../domain/master.models";
import { MasterQueryService } from "./master-query.service";

export type MasterPaymentQuoteFailure =
  | "SUBJECT_NOT_FOUND"
  | "CONTRACT_NOT_OWNED"
  | "INSTALLMENT_NOT_PAYABLE"
  | "INVALID_FINANCIAL_VALUE";

export interface MasterPaymentQuote {
  person: Person;
  contract: Contract;
  installment: Installment;
  amountCents: number;
  dueDate: Date;
}

export type MasterPaymentQuoteResult =
  | { status: "VERIFIED"; data: MasterPaymentQuote }
  | { status: "REJECTED"; reason: MasterPaymentQuoteFailure };

function parseMasterDueDate(value: string | null): Date | null {
  if (!value) return null;
  const day = /^(\d{4}-\d{2}-\d{2})/.exec(value)?.[1];
  const date = new Date(day ? `${day}T12:00:00.000Z` : value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Single read-only authority for a Master payment quote.
 *
 * Every consumer (public /pagos preflight, authenticated self-service and the
 * future durable checkout) must re-enter through this service immediately
 * before using a legacy amount. It verifies subject -> contract ownership,
 * re-applies the certified outstanding-installment rule, and converts the
 * current Firebird balance into integer COP cents without floating point.
 *
 * Repository/network failures are intentionally not swallowed here: callers
 * decide whether their boundary should map them to a generic 404 or a retryable
 * provider error. Business rejection is represented explicitly and never
 * confused with transport failure.
 */
@Injectable()
export class MasterPaymentQuoteService {
  constructor(private readonly master: MasterQueryService) {}

  async quote(personId: string, contractId: string, installmentId: string): Promise<MasterPaymentQuoteResult> {
    const person = await this.master.findPersonByDocument(personId);
    if (!person || person.personId !== personId) {
      return { status: "REJECTED", reason: "SUBJECT_NOT_FOUND" };
    }

    const contracts = await this.master.getContractsByPerson(person.personId);
    const contract = contracts.find((candidate) => candidate.contractId === contractId);
    if (!contract) {
      return { status: "REJECTED", reason: "CONTRACT_NOT_OWNED" };
    }

    const installments = await this.master.getOutstandingInstallments(contract.contractId);
    const installment = installments.find((candidate) => candidate.installmentId === installmentId);
    if (!installment) {
      return { status: "REJECTED", reason: "INSTALLMENT_NOT_PAYABLE" };
    }

    const amountCents = positiveMasterDecimalToCents(installment.balance);
    const dueDate = parseMasterDueDate(installment.dueDate);
    if (amountCents === null || dueDate === null) {
      return { status: "REJECTED", reason: "INVALID_FINANCIAL_VALUE" };
    }

    return {
      status: "VERIFIED",
      data: { person, contract, installment, amountCents, dueDate },
    };
  }
}
