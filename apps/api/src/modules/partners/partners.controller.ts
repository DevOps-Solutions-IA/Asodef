import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post } from "@nestjs/common";
import { ApiCookieAuth, ApiTags } from "@nestjs/swagger";
import { Public } from "../auth/decorators/public.decorator";
import { RequirePermissions } from "../auth/decorators/permissions.decorator";
import { PartnersService } from "./partners.service";
import { CreateBusinessPartnerDto } from "./dto/create-business-partner.dto";
import { UpdateBusinessPartnerChecksDto } from "./dto/update-business-partner-checks.dto";

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
  list() {
    return this.partnersService.list();
  }

  @ApiCookieAuth("asodef_at")
  @RequirePermissions("partners.manage")
  @Get("admin/partners/:id")
  findById(@Param("id", ParseUUIDPipe) id: string) {
    return this.partnersService.findById(id);
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
  publish(@Param("id", ParseUUIDPipe) id: string) {
    return this.partnersService.publish(id);
  }
}
