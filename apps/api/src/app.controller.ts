import { Controller, Get } from "@nestjs/common";
import { ASODEF_COMPANY } from "@asodef/config";
import { Public } from "./modules/auth/decorators/public.decorator";

@Controller()
export class AppController {
  @Public()
  @Get()
  getRoot(): { name: string; tagline: string } {
    return { name: ASODEF_COMPANY.legalName, tagline: ASODEF_COMPANY.tagline };
  }
}
