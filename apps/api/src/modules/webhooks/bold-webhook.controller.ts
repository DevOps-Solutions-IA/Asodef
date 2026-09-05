import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  type RawBodyRequest,
} from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { Public } from "../auth/decorators/public.decorator";
import { BoldWebhookService } from "./bold-webhook.service";
import { isValidBoldWebhookPayload } from "./bold-webhook-payload";

@ApiTags("webhooks")
@Controller("webhooks")
export class BoldWebhookController {
  constructor(private readonly boldWebhookService: BoldWebhookService) {}

  @Public()
  @Post("bold")
  @HttpCode(HttpStatus.OK)
  async receive(
    @Req() request: RawBodyRequest<Request>,
    @Body() payload: unknown,
    @Headers() headers: Record<string, string | string[] | undefined>,
  ) {
    if (!isValidBoldWebhookPayload(payload)) {
      throw new BadRequestException("El payload del webhook no tiene el formato esperado.");
    }
    await this.boldWebhookService.receive(payload, headers, request.rawBody);
    return { status: "received" };
  }
}
