import { Controller, Get, Query } from "@nestjs/common";
import { ApiCookieAuth, ApiTags } from "@nestjs/swagger";
import { RequirePermissions } from "../auth/decorators/permissions.decorator";
import { ControlPlaneRangeQueryDto } from "./dto/control-plane-range-query.dto";
import { KoralControlPlaneService } from "./koral-control-plane.service";

@ApiTags("koral-control-plane")
@ApiCookieAuth("asodef_at")
@RequirePermissions("settings.manage")
@Controller("admin/koral/control-plane")
export class KoralControlPlaneController {
  constructor(private readonly service: KoralControlPlaneService) {}

  @Get()
  overview() {
    return this.service.overview();
  }

  @Get("runtime/agents")
  runtimeAgents() {
    return this.service.runtimeAgents();
  }

  @Get("tools")
  tools() {
    return this.service.tools();
  }

  @Get("automations")
  automations(@Query() query: ControlPlaneRangeQueryDto) {
    return this.service.automations(query.hours, query.limit);
  }

  @Get("analytics")
  analytics(@Query() query: ControlPlaneRangeQueryDto) {
    return this.service.analytics(query.hours);
  }
}
