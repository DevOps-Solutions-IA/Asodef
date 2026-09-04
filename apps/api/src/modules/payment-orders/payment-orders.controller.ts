import { Body, Controller, Get, HttpCode, HttpStatus, NotFoundException, Param, ParseUUIDPipe, Post, Req } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { Public } from "../auth/decorators/public.decorator";
import { buildRequestContext } from "../../common/http/request-context.util";
import type { AuthenticatedRequest } from "../auth/types/request-user.type";
import { CreatePaymentOrderDto } from "./dto/create-payment-order.dto";
import { PreflightMasterPaymentDto } from "./dto/preflight-master-payment.dto";
import { MasterPaymentPreflightService } from "./master-payment-preflight.service";
import { toPublicMasterPaymentPreflightResponse } from "./master-payment-preflight.types";
import { PaymentOrdersService } from "./payment-orders.service";
import { toPaymentOrderResponse } from "./payment-order.types";

/**
 * US-024: "POST /api/v1/payment-orders creates an order from a chosen
 * obligation (per US-023); GET /api/v1/payment-orders/:reference
 * returns order details by public reference." Public - this is the
 * customer-facing payment lookup flow, no authentication required
 * (matches /leads, /content).
 */
@ApiTags("payment-orders")
@Controller("payment-orders")
export class PaymentOrdersController {
  constructor(
    private readonly paymentOrdersService: PaymentOrdersService,
    private readonly masterPaymentPreflight: MasterPaymentPreflightService,
  ) {}

  /**
   * Read-only boundary for Master-originated obligations. It decrypts the
   * opaque selector, re-reads the current payable installment from Firebird and
   * returns only public-safe fields. It deliberately creates no PaymentOrder and
   * cannot start Bold while the legacy write/application contract is unresolved.
   */
  @Public()
  @Post("master/preflight")
  @HttpCode(HttpStatus.OK)
  async preflightMaster(@Body() dto: PreflightMasterPaymentDto) {
    const source = await this.masterPaymentPreflight.verify(dto.selectionToken);
    if (!source) {
      throw new NotFoundException("No se encontraron resultados.");
    }
    return toPublicMasterPaymentPreflightResponse(source);
  }

  @Public()
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreatePaymentOrderDto, @Req() request: AuthenticatedRequest) {
    const order = await this.paymentOrdersService.create(dto.obligationId, buildRequestContext(request));
    return toPaymentOrderResponse(order);
  }

  // US-054: must be registered before the ":reference" route below -
  // NestJS matches param routes in registration order, so a literal
  // "disclosure" prefix has to come first or it would be swallowed as
  // a :reference value.
  @Public()
  @Get("disclosure/:obligationId")
  getDisclosure(@Param("obligationId", ParseUUIDPipe) obligationId: string) {
    return this.paymentOrdersService.getDisclosure(obligationId);
  }

  @Public()
  @Get(":reference")
  async findByReference(@Param("reference") reference: string) {
    const order = await this.paymentOrdersService.findByPublicReference(reference);
    if (!order) {
      // Same generic message as the lookup endpoint's negative case -
      // never confirm/deny which specific reference was tried beyond
      // "not found" (PRD rule: mask what's needed to avoid enumeration).
      throw new NotFoundException("No se encontraron resultados.");
    }
    return toPaymentOrderResponse(order);
  }
}
