import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { Public } from "../auth/decorators/public.decorator";
import { BoldPaymentsService } from "./bold-payments.service";
import { CreateBoldPaymentDto } from "./dto/create-bold-payment.dto";

@ApiTags("payments")
@Controller("payments")
export class BoldPaymentsController {
  constructor(private readonly boldPaymentsService: BoldPaymentsService) {}

  @Public()
  @Post("bold/create")
  @HttpCode(HttpStatus.CREATED)
  createPayment(@Body() dto: CreateBoldPaymentDto) {
    return this.boldPaymentsService.createPayment(dto.reference);
  }

  @Public()
  @Get(":reference/status")
  getStatus(@Param("reference") reference: string) {
    return this.boldPaymentsService.getStatus(reference);
  }
}
