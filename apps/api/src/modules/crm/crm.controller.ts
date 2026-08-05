import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post } from "@nestjs/common";
import { ApiCookieAuth, ApiTags } from "@nestjs/swagger";
import { RequirePermissions } from "../auth/decorators/permissions.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import type { RequestUser } from "../auth/types/request-user.type";
import { CrmService } from "./crm.service";
import { PromoteLeadDto } from "./dto/promote-lead.dto";
import { CreateOpportunityDto } from "./dto/create-opportunity.dto";
import { ChangeOpportunityStageDto } from "./dto/change-opportunity-stage.dto";
import { ScheduleCommercialActivityDto } from "./dto/schedule-commercial-activity.dto";

@ApiTags("crm")
@ApiCookieAuth("asodef_at")
@RequirePermissions("crm.manage")
@Controller("admin")
export class CrmController {
  constructor(private readonly crmService: CrmService) {}

  @Post("leads/:id/promote")
  @HttpCode(HttpStatus.CREATED)
  promoteLead(@Param("id", ParseUUIDPipe) id: string, @Body() dto: PromoteLeadDto) {
    return this.crmService.promoteLead(id, dto);
  }

  @Get("prospects")
  listProspects() {
    return this.crmService.listProspects();
  }

  @Get("prospects/:id")
  getProspect(@Param("id", ParseUUIDPipe) id: string) {
    return this.crmService.getProspect(id);
  }

  @Post("prospects/:id/opportunities")
  @HttpCode(HttpStatus.CREATED)
  createOpportunity(@Param("id", ParseUUIDPipe) id: string, @Body() dto: CreateOpportunityDto) {
    return this.crmService.createOpportunity(id, dto);
  }

  @Get("opportunities")
  listOpportunities() {
    return this.crmService.listOpportunities();
  }

  @Get("opportunities/:id")
  getOpportunity(@Param("id", ParseUUIDPipe) id: string) {
    return this.crmService.getOpportunity(id);
  }

  @Post("opportunities/:id/stage")
  @HttpCode(HttpStatus.OK)
  changeStage(@Param("id", ParseUUIDPipe) id: string, @Body() dto: ChangeOpportunityStageDto, @CurrentUser() actor: RequestUser) {
    return this.crmService.changeStage(id, dto, actor.id);
  }

  @Post("opportunities/:id/activities")
  @HttpCode(HttpStatus.CREATED)
  scheduleActivity(@Param("id", ParseUUIDPipe) id: string, @Body() dto: ScheduleCommercialActivityDto) {
    return this.crmService.scheduleActivity(id, dto);
  }

  @Post("activities/:id/complete")
  @HttpCode(HttpStatus.OK)
  completeActivity(@Param("id", ParseUUIDPipe) id: string) {
    return this.crmService.completeActivity(id);
  }
}
