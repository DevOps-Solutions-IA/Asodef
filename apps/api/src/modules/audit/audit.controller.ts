import { Controller, Get, Query } from "@nestjs/common";
import { ApiCookieAuth, ApiTags } from "@nestjs/swagger";
import { RequirePermissions } from "../auth/decorators/permissions.decorator";
import { AuditTimelineService } from "./audit-timeline.service";
import { AuditTimelineQueryDto } from "./dto/audit-timeline-query.dto";

@ApiTags("admin-audit")
@ApiCookieAuth("asodef_at")
@Controller("admin/auditoria")
export class AuditController {
  constructor(private readonly timeline: AuditTimelineService) {}

  @RequirePermissions("audit.read")
  @Get()
  list(@Query() query: AuditTimelineQueryDto) {
    return this.timeline.list(query);
  }
}
