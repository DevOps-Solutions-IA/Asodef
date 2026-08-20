import { Controller, Get } from "@nestjs/common";
import { ApiCookieAuth, ApiTags } from "@nestjs/swagger";
import { RequirePermissions } from "../auth/decorators/permissions.decorator";
import { AdminSystemService } from "./admin-system.service";

@ApiTags("admin-system")
@ApiCookieAuth("asodef_at")
@RequirePermissions("settings.manage")
@Controller("admin/sistema")
export class AdminSystemController {
  constructor(private readonly service: AdminSystemService) {}

  @Get()
  getStatus() {
    return this.service.getStatus();
  }
}
