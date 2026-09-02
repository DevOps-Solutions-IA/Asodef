import { BadRequestException, Body, Controller, Get, Headers, Param, Post, Req, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { Public } from "../auth/decorators/public.decorator";
import { PaymentOperationDto } from "./self-service.dto";
import { SelfServiceCsrfGuard, SelfServiceSessionGuard, type SelfServiceRequest } from "./self-service.guards";
import { SELF_SERVICE_PUBLIC_FIELDS, SelfServiceGatewayService } from "./self-service-gateway.service";

@Public()
@ApiTags("self-service-payments")
@Controller("self-service/payments")
export class SelfServicePaymentsController {
  constructor(private readonly gateway: SelfServiceGatewayService) {}

  @Post("quote") @UseGuards(SelfServiceSessionGuard, SelfServiceCsrfGuard)
  quote(@Req() request: SelfServiceRequest, @Body() dto: PaymentOperationDto) { const p = this.principal(request); this.gateway.assertScope(p, "payments:quote"); return this.gateway.readPayload(() => this.gateway.core.quotePayment(p.subjectRef, dto.payload), SELF_SERVICE_PUBLIC_FIELDS.paymentOperation, false); }

  @Post("apply-confirmed") @UseGuards(SelfServiceSessionGuard, SelfServiceCsrfGuard)
  apply(@Req() request: SelfServiceRequest, @Body() dto: PaymentOperationDto, @Headers("idempotency-key") key?: string) { const p = this.principal(request); this.gateway.assertScope(p, "payments:apply"); if (dto.confirmed !== true) throw new BadRequestException("La confirmación explícita es requerida."); return this.gateway.mutate(p, "PAYMENT_APPLY_CONFIRMED", key, dto, () => this.gateway.core.applyConfirmedPayment(p.subjectRef, dto.payload, key!)); }

  @Get("application/:id") @UseGuards(SelfServiceSessionGuard)
  application(@Req() request: SelfServiceRequest, @Param("id") id: string) { const p = this.principal(request); this.gateway.assertScope(p, "payments:read"); return this.gateway.readPayload(() => this.gateway.core.getPaymentApplication(p.subjectRef, id), SELF_SERVICE_PUBLIC_FIELDS.paymentOperation); }

  private principal(request: SelfServiceRequest) { if (!request.selfService) throw new BadRequestException("Sesión no disponible."); return request.selfService; }
}
