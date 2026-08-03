import { Controller, Get, HttpCode, HttpStatus, ServiceUnavailableException } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { HealthService } from "./health.service";

/**
 * Deliberately minimal response bodies: no credentials, connection
 * strings, hostnames, database names, or stack traces - just enough for
 * an operator or load balancer to know whether the service is usable.
 */
@ApiTags("health")
@Controller("health")
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  getHealth() {
    return { status: "ok" as const, timestamp: new Date().toISOString() };
  }

  @Get("live")
  @HttpCode(HttpStatus.OK)
  getLiveness() {
    return { status: "ok" as const };
  }

  @Get("ready")
  async getReadiness() {
    const result = await this.healthService.checkReadiness();
    if (!result.ready) {
      throw new ServiceUnavailableException({
        status: "error",
        checks: result.checks,
      });
    }
    return { status: "ok" as const, checks: result.checks };
  }
}
