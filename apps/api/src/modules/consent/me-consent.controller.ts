import { Controller, Get } from "@nestjs/common";
import { ApiCookieAuth, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import type { RequestUser } from "../auth/types/request-user.type";
import { ConsentService } from "./consent.service";

/**
 * US-071: self-service "Mis consentimientos" - deliberately a separate
 * controller from ConsentController (which is class-level gated by
 * data.manage for the admin evidence-search screen). This one requires
 * only the default authenticated-session guard (JwtAuthGuard, applied
 * globally) - any logged-in user may read their *own* consent history,
 * never anyone else's. userId always comes from @CurrentUser(), never
 * from a request parameter, so this can never become an IDOR route.
 */
@ApiTags("consent")
@ApiCookieAuth("asodef_at")
@Controller("me/consent-records")
export class MeConsentController {
  constructor(private readonly consentService: ConsentService) {}

  @Get()
  list(@CurrentUser() user: RequestUser) {
    return this.consentService.listForUser(user.id);
  }
}
