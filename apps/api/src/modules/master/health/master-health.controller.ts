import { Controller, Get, ServiceUnavailableException } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { Public } from "../../auth/decorators/public.decorator";
import { MasterHealthService } from "./master-health.service";

@Public()
@ApiTags("health")
@Controller("health/master")
export class MasterHealthController {
  constructor(private readonly healthService: MasterHealthService) {}

  @Get()
  async check() {
    const result = await this.healthService.check();
    if (result.status === "unavailable") {
      throw new ServiceUnavailableException(result);
    }
    return result;
  }
}
