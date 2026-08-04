import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../database/prisma.service";
import { OUTSTANDING_OBLIGATION_STATUSES, PaymentOrdersService } from "../payment-orders/payment-orders.service";
import { toPaymentOrderResponse } from "../payment-orders/payment-order.types";
import type { PaymentsLookupDto } from "./dto/payments-lookup.dto";
import { toLookupCustomerResponse, toLookupObligationResponse, type PaymentsLookupResponse } from "./payments-lookup.types";

/** Identical message regardless of *why* nothing was found - "no
 * information leakage about which identifier failed" (AC, verbatim). */
const GENERIC_NOT_FOUND_MESSAGE = "No se encontraron resultados.";

@Injectable()
export class PaymentsLookupService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly paymentOrdersService: PaymentOrdersService,
  ) {}

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

  private async lookupByDocument(documentType: string, documentNumber: string): Promise<PaymentsLookupResponse> {
    const customer = await this.prisma.customer.findUnique({
      where: { documentType_documentNumber: { documentType, documentNumber } },
    });

    // A real customer with zero outstanding obligations is treated
    // identically to "customer doesn't exist" - anything else would let
    // an attacker distinguish "valid document, no debt" from "invalid
    // document" by response shape alone, the exact enumeration this
    // endpoint's negative case exists to prevent.
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
}
