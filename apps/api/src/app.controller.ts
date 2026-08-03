import { Controller, Get } from "@nestjs/common";
import { ASODEF_COMPANY } from "@asodef/config";

@Controller()
export class AppController {
  @Get()
  getRoot(): { name: string; tagline: string } {
    return { name: ASODEF_COMPANY.legalName, tagline: ASODEF_COMPANY.tagline };
  }
}
