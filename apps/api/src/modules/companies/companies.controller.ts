import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from "@nestjs/common";
import { ApiCookieAuth, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { RequirePermissions } from "../auth/decorators/permissions.decorator";
import type { RequestUser } from "../auth/types/request-user.type";
import { CompaniesService } from "./companies.service";
import { CreateCompanyDto } from "./dto/create-company.dto";

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

  /** US-074: companies.manage, not the class-level companies.read - a
   * method-level @RequirePermissions overrides the class-level one
   * (PermissionsGuard uses Reflector.getAllAndOverride), so reading the
   * list never grants the ability to create one. */
  @Post()
  @RequirePermissions("companies.manage")
  create(@CurrentUser() user: RequestUser, @Body() dto: CreateCompanyDto) {
    return this.companiesService.create(user.id, dto);
  }
}
