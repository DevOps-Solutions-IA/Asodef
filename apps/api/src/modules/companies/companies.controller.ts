import { Controller, Get, Param, ParseUUIDPipe } from "@nestjs/common";
import { ApiCookieAuth, ApiTags } from "@nestjs/swagger";
import { RequirePermissions } from "../auth/decorators/permissions.decorator";
import { CompaniesService } from "./companies.service";

@ApiTags("companies")
@ApiCookieAuth("asodef_at")
@RequirePermissions("companies.read")
@Controller("admin/companies")
export class CompaniesController {
  constructor(private readonly companiesService: CompaniesService) {}

  @Get()
  list() {
    return this.companiesService.list();
  }

  @Get(":id")
  findById(@Param("id", ParseUUIDPipe) id: string) {
    return this.companiesService.findById(id);
  }
}
