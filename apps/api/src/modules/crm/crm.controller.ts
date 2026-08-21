import { Body, Controller, Get, Headers, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Query, Req } from "@nestjs/common";
import { ApiCookieAuth, ApiTags } from "@nestjs/swagger";
import { RequirePermissions } from "../auth/decorators/permissions.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import type { AuthenticatedRequest, RequestUser } from "../auth/types/request-user.type";
import { buildRequestContext } from "../../common/http/request-context.util";
import { CrmService } from "./crm.service";
import { PromoteLeadDto } from "./dto/promote-lead.dto";
import { CreateOpportunityDto } from "./dto/create-opportunity.dto";
import { ChangeOpportunityStageDto } from "./dto/change-opportunity-stage.dto";
import { ScheduleCommercialActivityDto } from "./dto/schedule-commercial-activity.dto";
import { CreateProposalDto } from "./dto/create-proposal.dto";
import { CreateAgreementDto } from "./dto/create-agreement.dto";
import { ListProspectsQueryDto } from "./dto/list-prospects-query.dto";
import { ListLeadsQueryDto } from "./dto/list-leads-query.dto";
import { ListOpportunitiesQueryDto } from "./dto/list-opportunities-query.dto";
import { AssignOwnerDto } from "./dto/assign-owner.dto";
import { OpportunityTimelineQueryDto } from "./dto/opportunity-timeline-query.dto";

/**
 * US-061 AC5: a user without crm.manage must still be able to see these
 * screens read-only, not get a 403 - so read (GET) routes are gated by
 * the separate crm.read permission, while every mutating route keeps the
 * original crm.manage. No class-level guard here (unlike this
 * controller's prior shape) since the two permissions now diverge per
 * route.
 */
@ApiTags("crm")
@ApiCookieAuth("asodef_at")
@Controller("admin")
export class CrmController {
  constructor(private readonly crmService: CrmService) {}

  @RequirePermissions("crm.manage")
  @Post("leads/:id/promote")
  @HttpCode(HttpStatus.CREATED)
  promoteLead(@Param("id", ParseUUIDPipe) id: string, @Body() dto: PromoteLeadDto, @CurrentUser() actor: RequestUser) {
    return this.crmService.promoteLead(id, dto, actor.id);
  }

  @RequirePermissions("crm.read")
  @Get("prospects")
  listProspects(@Query() query: ListProspectsQueryDto) {
    return this.crmService.listProspects(query);
  }

  @RequirePermissions("crm.read")
  @Get("leads")
  listLeads(@Query() query: ListLeadsQueryDto) {
    return this.crmService.listLeads(query);
  }

  @RequirePermissions("crm.read")
  @Get("prospects/:id")
  getProspect(@Param("id", ParseUUIDPipe) id: string) {
    return this.crmService.getProspect(id);
  }

  @RequirePermissions("crm.manage")
  @Patch("prospects/:id/assignment")
  assignProspect(@Param("id", ParseUUIDPipe) id: string, @Body() dto: AssignOwnerDto) {
    return this.crmService.assignProspect(id, dto);
  }

  @RequirePermissions("crm.manage")
  @Post("prospects/:id/opportunities")
  @HttpCode(HttpStatus.CREATED)
  createOpportunity(@Param("id", ParseUUIDPipe) id: string, @Body() dto: CreateOpportunityDto, @CurrentUser() actor: RequestUser, @Req() request: AuthenticatedRequest) {
    return this.crmService.createOpportunity(id, dto, actor.id, buildRequestContext(request));
  }

  @RequirePermissions("crm.read")
  @Get("opportunities")
  listOpportunities(@Query() query: ListOpportunitiesQueryDto) {
    return this.crmService.listOpportunities(query);
  }

  @RequirePermissions("crm.read")
  @Get("opportunities/:id")
  getOpportunity(@Param("id", ParseUUIDPipe) id: string) {
    return this.crmService.getOpportunity(id);
  }

  @RequirePermissions("crm.manage")
  @Patch("opportunities/:id/assignment")
  assignOpportunity(@Param("id", ParseUUIDPipe) id: string, @Body() dto: AssignOwnerDto, @CurrentUser() actor: RequestUser, @Req() request: AuthenticatedRequest) {
    return this.crmService.assignOpportunity(id, dto, actor.id, buildRequestContext(request));
  }

  @RequirePermissions("crm.manage")
  @Post("opportunities/:id/stage")
  @HttpCode(HttpStatus.OK)
  changeStage(@Param("id", ParseUUIDPipe) id: string, @Body() dto: ChangeOpportunityStageDto, @CurrentUser() actor: RequestUser, @Req() request: AuthenticatedRequest) {
    return this.crmService.changeStage(id, dto, actor.id, buildRequestContext(request));
  }

  @RequirePermissions("crm.read")
  @Get("opportunities/:id/status-history")
  listStatusHistory(@Param("id", ParseUUIDPipe) id: string) {
    return this.crmService.listStatusHistory(id);
  }

  @RequirePermissions("crm.read")
  @Get("opportunities/:id/timeline")
  getTimeline(@Param("id", ParseUUIDPipe) id: string, @Query() query: OpportunityTimelineQueryDto) {
    return this.crmService.getTimeline(id, query);
  }

  @RequirePermissions("crm.read")
  @Get("opportunities/:id/activities")
  listActivities(@Param("id", ParseUUIDPipe) id: string) {
    return this.crmService.listActivities(id);
  }

  @RequirePermissions("crm.manage")
  @Post("opportunities/:id/activities")
  @HttpCode(HttpStatus.CREATED)
  scheduleActivity(@Param("id", ParseUUIDPipe) id: string, @Body() dto: ScheduleCommercialActivityDto, @CurrentUser() actor: RequestUser, @Req() request: AuthenticatedRequest) {
    return this.crmService.scheduleActivity(id, dto, actor.id, buildRequestContext(request));
  }

  @RequirePermissions("crm.manage")
  @Post("activities/:id/complete")
  @HttpCode(HttpStatus.OK)
  completeActivity(@Param("id", ParseUUIDPipe) id: string, @CurrentUser() actor: RequestUser, @Req() request: AuthenticatedRequest) {
    return this.crmService.completeActivity(id, actor.id, buildRequestContext(request));
  }

  @RequirePermissions("crm.manage")
  @Post("opportunities/:id/proposals")
  @HttpCode(HttpStatus.CREATED)
  createProposal(@Param("id", ParseUUIDPipe) id: string, @Body() dto: CreateProposalDto, @CurrentUser() actor: RequestUser, @Req() request: AuthenticatedRequest, @Headers("idempotency-key") idempotencyKey?: string) {
    return this.crmService.createProposal(id, dto, actor.id, buildRequestContext(request), idempotencyKey);
  }

  @RequirePermissions("crm.read")
  @Get("opportunities/:id/proposals")
  listProposals(@Param("id", ParseUUIDPipe) id: string) {
    return this.crmService.listProposals(id);
  }

  @RequirePermissions("crm.manage")
  @Post("opportunities/:id/agreement")
  @HttpCode(HttpStatus.CREATED)
  createAgreement(@Param("id", ParseUUIDPipe) id: string, @Body() dto: CreateAgreementDto, @CurrentUser() actor: RequestUser, @Req() request: AuthenticatedRequest, @Headers("idempotency-key") idempotencyKey?: string) {
    return this.crmService.createAgreement(id, dto, actor.id, buildRequestContext(request), idempotencyKey);
  }

  @RequirePermissions("crm.read")
  @Get("opportunities/:id/agreements")
  listAgreements(@Param("id", ParseUUIDPipe) id: string) {
    return this.crmService.listAgreements(id);
  }
}
