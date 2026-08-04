import { BadRequestException, Body, Controller, Headers, HttpCode, HttpStatus, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { Public } from "../auth/decorators/public.decorator";
import { BoldWebhookService } from "./bold-webhook.service";
import { isValidBoldWebhookPayload } from "./bold-webhook-payload";

@ApiTags("webhooks")
@Controller("webhooks")
export class BoldWebhookController {
  constructor(private readonly boldWebhookService: BoldWebhookService) {}

  @Public()
  @Post("bold")
  @HttpCode(HttpStatus.ACCEPTED)
  async receive(@Body() payload: unknown, @Headers() headers: Record<string, string | string[] | undefined>) {
    // Deliberately not a class-validator DTO - see bold-webhook-payload.ts:
    // the global ValidationPipe's whitelist/forbidNonWhitelisted would
    // silently strip or reject unconfirmed fields Bold might actually
    // send in a real payload.
    if (!isValidBoldWebhookPayload(payload)) {
      throw new BadRequestException("El payload del webhook no tiene el formato esperado.");
    }
    await this.boldWebhookService.receive(payload, headers);
    return { status: "received" };
  }
}
