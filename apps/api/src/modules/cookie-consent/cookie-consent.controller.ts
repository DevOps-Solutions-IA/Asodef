import { Body, Controller, HttpCode, HttpStatus, Post, Req } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { Public } from "../auth/decorators/public.decorator";
import { buildRequestContext } from "../../common/http/request-context.util";
import type { AuthenticatedRequest } from "../auth/types/request-user.type";
import { CookieConsentService } from "./cookie-consent.service";
import { RecordCookieConsentDto } from "./dto/record-cookie-consent.dto";

@ApiTags("cookie-consent")
@Controller("cookie-consent")
export class CookieConsentController {
  constructor(private readonly cookieConsentService: CookieConsentService) {}

  @Public()
  @Post()
  @HttpCode(HttpStatus.NO_CONTENT)
  async record(@Body() dto: RecordCookieConsentDto, @Req() request: AuthenticatedRequest): Promise<void> {
    await this.cookieConsentService.record(dto, buildRequestContext(request));
  }
}
