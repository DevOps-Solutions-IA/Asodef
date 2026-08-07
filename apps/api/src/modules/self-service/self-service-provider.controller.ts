import { Controller, Get } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { Public } from "../auth/decorators/public.decorator";
import { SelfServiceProviderRegistry } from "./self-service-provider.registry";

@Public()
@ApiTags("self-service-provider")
@Controller("self-service/provider-health")
export class SelfServiceProviderController {
  constructor(private readonly registry: SelfServiceProviderRegistry) {}

  @Get()
  health() {
    return this.registry.health();
  }
}
