import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from "@nestjs/common";
import { ApiCookieAuth, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { RequirePermissions } from "../auth/decorators/permissions.decorator";
import type { RequestUser } from "../auth/types/request-user.type";
import { CompaniesService } from "./companies.service";
import { CreateCompanyDto } from "./dto/create-company.dto";
import { ListCompaniesQueryDto } from "./dto/list-companies-query.dto";
import { CreateCompanyContactDto } from "./dto/create-company-contact.dto";
import { CreateCompanySiteDto } from "./dto/create-company-site.dto";

@ApiTags("companies")
@ApiCookieAuth("asodef_at")
@RequirePermissions("companies.read")
@Controller("admin/companies")
export class CompaniesController {
  constructor(private readonly companiesService: CompaniesService) {}

  @Get()
  list(@Query() query: ListCompaniesQueryDto) {
    return this.companiesService.list(query);
  }

  @Get(":id")
  findById(@Param("id", ParseUUIDPipe) id: string) {
    return this.companiesService.findById(id);
  }

  @Get(":id/contacts")
  listContacts(@Param("id", ParseUUIDPipe) id: string) {
    return this.companiesService.listContacts(id);
  }

  @Post(":id/contacts")
  @RequirePermissions("companies.manage")
  createContact(@CurrentUser() user: RequestUser, @Param("id", ParseUUIDPipe) id: string, @Body() dto: CreateCompanyContactDto) {
    return this.companiesService.createContact(user.id, id, dto);
  }

  @Get(":id/sites")
  listSites(@Param("id", ParseUUIDPipe) id: string) {
    return this.companiesService.listSites(id);
  }

  @Post(":id/sites")
  @RequirePermissions("companies.manage")
  createSite(@CurrentUser() user: RequestUser, @Param("id", ParseUUIDPipe) id: string, @Body() dto: CreateCompanySiteDto) {
    return this.companiesService.createSite(user.id, id, dto);
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
