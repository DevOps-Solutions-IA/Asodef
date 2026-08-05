import { Body, Controller, Get, HttpCode, HttpStatus, NotFoundException, Param, Post, Req } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { Public } from "../auth/decorators/public.decorator";
import { buildRequestContext } from "../../common/http/request-context.util";
import type { AuthenticatedRequest } from "../auth/types/request-user.type";
import { PaymentOrdersService } from "./payment-orders.service";
import { CreatePaymentOrderDto } from "./dto/create-payment-order.dto";
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
  constructor(private readonly paymentOrdersService: PaymentOrdersService) {}

  @Public()
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreatePaymentOrderDto, @Req() request: AuthenticatedRequest) {
    const order = await this.paymentOrdersService.create(dto.obligationId, buildRequestContext(request));
    return toPaymentOrderResponse(order);
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
