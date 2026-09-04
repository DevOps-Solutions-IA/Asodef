import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../../database/prisma.service";
import type { EnvConfig } from "../../config/env.validation";
import { MasterQueryService } from "../master/application/master-query.service";
import { positiveMasterDecimalToCents } from "../master/domain/master-money";
import { payableInstallmentStatus } from "../master/domain/master-payable-installments";
import { MasterPaymentSelectionTokenService } from "../payment-orders/master-payment-selection-token.service";
import { OUTSTANDING_OBLIGATION_STATUSES, PaymentOrdersService } from "../payment-orders/payment-orders.service";
import { toPaymentOrderResponse } from "../payment-orders/payment-order.types";
import type { PaymentsLookupDto } from "./dto/payments-lookup.dto";
import { maskDocumentNumber } from "./mask-document-number";
import { toLookupCustomerResponse, toLookupObligationResponse, type LookupObligationResponse, type PaymentsLookupResponse } from "./payments-lookup.types";

/** Identical message regardless of *why* nothing was found - "no
 * information leakage about which identifier failed" (AC, verbatim). */
const GENERIC_NOT_FOUND_MESSAGE = "No se encontraron resultados.";

function normalizeDocumentType(value: string): string {
  return value.trim().toUpperCase();
}

function masterDueDate(value: string | null): Date | null {
  if (!value) return null;
  const day = /^(\d{4}-\d{2}-\d{2})/.exec(value)?.[1];
  const date = new Date(day ? `${day}T12:00:00.000Z` : value);
  return Number.isNaN(date.getTime()) ? null : date;
}

@Injectable()
export class PaymentsLookupService {
  private readonly useMaster: boolean;

  constructor(
    private readonly prisma: PrismaService,
    private readonly paymentOrdersService: PaymentOrdersService,
    private readonly master: MasterQueryService,
    private readonly masterSelectionTokens: MasterPaymentSelectionTokenService,
    config: ConfigService<EnvConfig, true>,
  ) {
    this.useMaster = config.get("EXTERNAL_CORE_PROVIDER", { infer: true }) === "master";
  }

  async lookup(dto: PaymentsLookupDto): Promise<PaymentsLookupResponse> {
    if (dto.reference) {
      return this.lookupByReference(dto.reference);
    }
    if (dto.documentType && dto.documentNumber) {
      return this.lookupByDocument(dto.documentType, dto.documentNumber);
    }
    throw new BadRequestException("Debes indicar un tipo y número de documento, o una referencia de pago.");
  }

  private async lookupByReference(reference: string): Promise<PaymentsLookupResponse> {
    const order = await this.paymentOrdersService.findByPublicReference(reference);
    if (!order) {
      throw new NotFoundException(GENERIC_NOT_FOUND_MESSAGE);
    }
    return { type: "order", order: toPaymentOrderResponse(order) };
  }

  private lookupByDocument(documentType: string, documentNumber: string): Promise<PaymentsLookupResponse> {
    return this.useMaster
      ? this.lookupMasterByDocument(documentType, documentNumber)
      : this.lookupModernByDocument(documentType, documentNumber);
  }

  private async lookupModernByDocument(documentType: string, documentNumber: string): Promise<PaymentsLookupResponse> {
    const customer = await this.prisma.customer.findUnique({
      where: { documentType_documentNumber: { documentType, documentNumber } },
    });

    if (!customer) {
      throw new NotFoundException(GENERIC_NOT_FOUND_MESSAGE);
    }

    const obligations = await this.prisma.obligation.findMany({
      where: { customerId: customer.id, status: { in: [...OUTSTANDING_OBLIGATION_STATUSES] } },
      orderBy: { dueDate: "asc" },
    });
    if (obligations.length === 0) {
      throw new NotFoundException(GENERIC_NOT_FOUND_MESSAGE);
    }

    return {
      type: "customer",
      customer: toLookupCustomerResponse(customer),
      obligations: obligations.map(toLookupObligationResponse),
    };
  }

  private async lookupMasterByDocument(documentType: string, documentNumber: string): Promise<PaymentsLookupResponse> {
    let person;
    try {
      person = await this.master.findPersonByDocument(documentNumber.trim());
    } catch {
      throw new NotFoundException(GENERIC_NOT_FOUND_MESSAGE);
    }
    if (!person) throw new NotFoundException(GENERIC_NOT_FOUND_MESSAGE);

    const requestedType = normalizeDocumentType(documentType);
    if (person.documentType && normalizeDocumentType(person.documentType) !== requestedType) {
      throw new NotFoundException(GENERIC_NOT_FOUND_MESSAGE);
    }

    let contracts;
    try {
      contracts = await this.master.getContractsByPerson(person.personId);
    } catch {
      throw new NotFoundException(GENERIC_NOT_FOUND_MESSAGE);
    }

    const groups = await Promise.all(
      contracts.map(async (contract) => {
        try {
          return { contract, installments: await this.master.getOutstandingInstallments(contract.contractId) };
        } catch {
          return { contract, installments: [] };
        }
      }),
    );

    const obligations: LookupObligationResponse[] = groups.flatMap(({ contract, installments }) =>
      installments.flatMap((installment) => {
        const amountCents = positiveMasterDecimalToCents(installment.balance);
        const dueDate = masterDueDate(installment.dueDate);
        const status = payableInstallmentStatus(installment);
        if (amountCents === null || dueDate === null || !status) return [];
        return [{
          obligationId: this.masterSelectionTokens.issue({
            personId: person.personId,
            contractId: contract.contractId,
            installmentId: installment.installmentId,
          }),
          concept: installment.installmentNumber === null
            ? "Cuota ASODEF"
            : `Cuota ${installment.installmentNumber}`,
          amountCents,
          currency: "COP",
          dueDate,
          status,
          source: "master" as const,
          onlinePaymentAvailable: false,
        }];
      }),
    );

    if (obligations.length === 0) {
      throw new NotFoundException(GENERIC_NOT_FOUND_MESSAGE);
    }

    const fullName = [person.names, person.surnames].filter(Boolean).join(" ").trim() || "Afiliado ASODEF";
    return {
      type: "customer",
      customer: {
        fullName,
        documentType: person.documentType ?? requestedType,
        maskedDocumentNumber: maskDocumentNumber(person.document ?? documentNumber.trim()),
      },
      obligations,
    };
  }
}
