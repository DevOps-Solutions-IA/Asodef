import { Body, Controller, Get, HttpCode, HttpStatus, NotFoundException, Param, ParseUUIDPipe, Post, Req } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { Public } from "../auth/decorators/public.decorator";
import { buildRequestContext } from "../../common/http/request-context.util";
import type { AuthenticatedRequest } from "../auth/types/request-user.type";
import { CreatePaymentOrderDto } from "./dto/create-payment-order.dto";
import { PreflightMasterPaymentDto } from "./dto/preflight-master-payment.dto";
import { MasterPaymentOrdersService } from "./master-payment-orders.service";
import { MasterPaymentPreflightService } from "./master-payment-preflight.service";
import { toPublicMasterPaymentPreflightResponse } from "./master-payment-preflight.types";
import { PaymentOrdersService } from "./payment-orders.service";
import { toPaymentOrderResponse } from "./payment-order.types";

@ApiTags("payment-orders")
@Controller("payment-orders")
export class PaymentOrdersController {
  constructor(
    private readonly paymentOrdersService: PaymentOrdersService,
    private readonly masterPaymentPreflight: MasterPaymentPreflightService,
    private readonly masterPaymentOrders: MasterPaymentOrdersService,
  ) {}

  /** Read-only revalidation of an opaque Master selector. */
  @Public()
  @Post("master/preflight")
  @HttpCode(HttpStatus.OK)
  async preflightMaster(@Body() dto: PreflightMasterPaymentDto) {
    const source = await this.masterPaymentPreflight.verify(dto.selectionToken);
    if (!source) throw new NotFoundException("No se encontraron resultados.");
    return toPublicMasterPaymentPreflightResponse(source);
  }

  /**
   * Durable external-obligation order. The request deliberately has no amount
   * field: the service re-reads Master and snapshots the authoritative value.
   */
  @Public()
  @Post("master")
  @HttpCode(HttpStatus.CREATED)
  createMaster(@Body() dto: PreflightMasterPaymentDto, @Req() request: AuthenticatedRequest) {
    return this.masterPaymentOrders.create(dto.selectionToken, buildRequestContext(request));
  }

  @Public()
  @Get("master/:reference")
  async findMasterByReference(@Param("reference") reference: string) {
    const order = await this.masterPaymentOrders.findPublic(reference);
    if (!order) throw new NotFoundException("No se encontraron resultados.");
    return order;
  }

  @Public()
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreatePaymentOrderDto, @Req() request: AuthenticatedRequest) {
    const order = await this.paymentOrdersService.create(dto.obligationId, buildRequestContext(request));
    return toPaymentOrderResponse(order);
  }

  @Public()
  @Get("disclosure/:obligationId")
  getDisclosure(@Param("obligationId", ParseUUIDPipe) obligationId: string) {
    return this.paymentOrdersService.getDisclosure(obligationId);
  }

  @Public()
  @Get(":reference")
  async findByReference(@Param("reference") reference: string) {
    const order = await this.paymentOrdersService.findByPublicReference(reference);
    if (!order) throw new NotFoundException("No se encontraron resultados.");
    return toPaymentOrderResponse(order);
  }
}
