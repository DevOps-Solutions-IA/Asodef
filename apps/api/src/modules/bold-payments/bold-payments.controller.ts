import { Body, Controller, Get, HttpCode, HttpStatus, NotFoundException, Param, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { Public } from "../auth/decorators/public.decorator";
import { BoldPaymentsService } from "./bold-payments.service";
import { CreateBoldPaymentDto } from "./dto/create-bold-payment.dto";
import { MasterBoldPaymentsService } from "./master-bold-payments.service";

@ApiTags("payments")
@Controller("payments")
export class BoldPaymentsController {
  constructor(
    private readonly boldPaymentsService: BoldPaymentsService,
    private readonly masterBoldPaymentsService: MasterBoldPaymentsService,
  ) {}

  @Public()
  @Post("bold/master/create")
  @HttpCode(HttpStatus.CREATED)
  async createMasterPayment(@Body() dto: CreateBoldPaymentDto) {
    const result = await this.masterBoldPaymentsService.create(dto.reference);
    if (!result) throw new NotFoundException("No se encontraron resultados.");
    return result;
  }

  @Public()
  @Get("master/:reference/status")
  async getMasterStatus(@Param("reference") reference: string) {
    const result = await this.masterBoldPaymentsService.getStatus(reference);
    if (!result) throw new NotFoundException("No se encontraron resultados.");
    return result;
  }

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
