import { Controller, Get, Param, ParseUUIDPipe, Query } from "@nestjs/common";
import { ApiCookieAuth, ApiTags } from "@nestjs/swagger";
import { RequirePermissions } from "../auth/decorators/permissions.decorator";
import { ConsentService } from "./consent.service";
import { SearchConsentRecordsQueryDto } from "./dto/search-consent-records-query.dto";

/**
 * US-062 AC2: admin consent-record search/evidence view. Gated by
 * data.manage (not a new permission) - ConsentRecord is part of the same
 * habeas-data domain data-subject-requests already uses that key for,
 * and CUSTOMER_SERVICE (which owns habeas data day-to-day) already holds
 * it.
 */
@ApiTags("consent")
@ApiCookieAuth("asodef_at")
@RequirePermissions("data.manage")
@Controller("admin/consent-records")
export class ConsentController {
  constructor(private readonly consentService: ConsentService) {}

  @Get()
  search(@Query() query: SearchConsentRecordsQueryDto) {
    return this.consentService.search(query);
  }

  @Get(":id")
  getDetail(@Param("id", ParseUUIDPipe) id: string) {
    return this.consentService.getDetail(id);
  }
}
