import { Body, Controller, HttpCode, HttpStatus, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { Public } from "../auth/decorators/public.decorator";
import { PaymentsLookupService } from "./payments-lookup.service";
import { PaymentsLookupDto } from "./dto/payments-lookup.dto";

/**
 * US-024: "A lookup endpoint accepts either {documentType,
 * documentNumber} or {reference} and returns masked customer info +
 * outstanding obligations (or the specific order)." No exact route
 * name is given anywhere in the PRD (confirmed - the later frontend
 * story just says "the US-024 lookup endpoint" without naming a path)
 * - POST /api/v1/payments/lookup chosen deliberately: POST (not GET)
 * because a document number in a URL/query string would leak into
 * access logs and browser history, which a request body doesn't.
 */
@ApiTags("payments")
@Controller("payments")
export class PaymentsLookupController {
  constructor(private readonly paymentsLookupService: PaymentsLookupService) {}

  @Public()
  @Post("lookup")
  @HttpCode(HttpStatus.OK)
  lookup(@Body() dto: PaymentsLookupDto) {
    return this.paymentsLookupService.lookup(dto);
  }
}
