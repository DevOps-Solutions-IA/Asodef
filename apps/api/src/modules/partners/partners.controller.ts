import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Query } from "@nestjs/common";
import { ApiCookieAuth, ApiTags } from "@nestjs/swagger";
import { Public } from "../auth/decorators/public.decorator";
import { RequirePermissions } from "../auth/decorators/permissions.decorator";
import { PartnersService } from "./partners.service";
import { CreateBusinessPartnerDto } from "./dto/create-business-partner.dto";
import { UpdateBusinessPartnerChecksDto } from "./dto/update-business-partner-checks.dto";
import { ListBusinessPartnersQueryDto } from "./dto/list-business-partners-query.dto";
import { PublishBusinessPartnerDto } from "./dto/publish-business-partner.dto";
import { UpsertPartnerContactDto } from "./dto/upsert-partner-contact.dto";

@ApiTags("partners")
@Controller()
export class PartnersController {
  constructor(private readonly partnersService: PartnersService) {}

  @Public()
  @Get("partners")
  listPublic() {
    return this.partnersService.listPublic();
  }

  @ApiCookieAuth("asodef_at")
  @RequirePermissions("partners.manage")
  @Post("admin/partners")
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateBusinessPartnerDto) {
    return this.partnersService.create(dto);
  }

  @ApiCookieAuth("asodef_at")
  @RequirePermissions("partners.manage")
  @Get("admin/partners")
  list(@Query() query: ListBusinessPartnersQueryDto) {
    return this.partnersService.list(query);
  }

  @ApiCookieAuth("asodef_at")
  @RequirePermissions("partners.manage")
  @Get("admin/partners/:id")
  findById(@Param("id", ParseUUIDPipe) id: string) {
    return this.partnersService.findById(id);
  }

  @ApiCookieAuth("asodef_at")
  @RequirePermissions("partners.manage")
  @Get("admin/partners/:id/contact")
  getContact(@Param("id", ParseUUIDPipe) id: string) {
    return this.partnersService.getContact(id);
  }

  @ApiCookieAuth("asodef_at")
  @RequirePermissions("partners.manage")
  @Patch("admin/partners/:id/contact")
  upsertContact(@Param("id", ParseUUIDPipe) id: string, @Body() dto: UpsertPartnerContactDto) {
    return this.partnersService.upsertContact(id, dto);
  }

  @ApiCookieAuth("asodef_at")
  @RequirePermissions("partners.manage")
  @Patch("admin/partners/:id/checks")
  updateChecks(@Param("id", ParseUUIDPipe) id: string, @Body() dto: UpdateBusinessPartnerChecksDto) {
    return this.partnersService.updateChecks(id, dto);
  }

  @ApiCookieAuth("asodef_at")
  @RequirePermissions("partners.manage")
  @Post("admin/partners/:id/publish")
  @HttpCode(HttpStatus.OK)
  publish(@Param("id", ParseUUIDPipe) id: string, @Body() dto: PublishBusinessPartnerDto) {
    return this.partnersService.publish(id, dto);
  }
}
