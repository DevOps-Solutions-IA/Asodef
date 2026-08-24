import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Query, Req } from "@nestjs/common";
import { ApiCookieAuth, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { RequirePermissions } from "../auth/decorators/permissions.decorator";
import { RequireStepUp } from "../auth/decorators/require-step-up.decorator";
import type { AuthenticatedRequest, RequestUser } from "../auth/types/request-user.type";
import { AddInternalNoteDto } from "./dto/add-internal-note.dto";
import { AssignConversationDto } from "./dto/assign-conversation.dto";
import { EscalateConversationDto } from "./dto/escalate-conversation.dto";
import { ChangeConversationPriorityDto } from "./dto/change-conversation-priority.dto";
import { ListConversationsQueryDto } from "./dto/list-conversations-query.dto";
import { ReleaseConversationDto } from "./dto/release-conversation.dto";
import { ReturnToKoralDto } from "./dto/return-to-koral.dto";
import { TransitionConversationDto } from "./dto/transition-conversation.dto";
import { KoralConversationsService } from "./koral-conversations.service";

@ApiTags("koral-conversations")
@ApiCookieAuth("asodef_at")
@Controller("admin/koral/conversations")
export class KoralConversationsController {
  constructor(private readonly conversations: KoralConversationsService) {}

  @RequirePermissions("koral.conversations.read")
  @Get()
  list(@Query() query: ListConversationsQueryDto, @CurrentUser() actor: RequestUser) {
    return this.conversations.list(query, actor.id);
  }

  @RequirePermissions("koral.conversations.manage")
  @Get("eligible-assignees")
  eligibleAssignees() {
    return this.conversations.listEligibleAssignees();
  }

  @RequirePermissions("koral.conversations.read")
  @Get(":id")
  findById(@Param("id", ParseUUIDPipe) id: string, @CurrentUser() actor: RequestUser) {
    return this.conversations.findById(id, actor.id);
  }

  @RequirePermissions("koral.conversations.manage")
  @RequireStepUp()
  @Post(":id/assignments")
  @HttpCode(HttpStatus.OK)
  assign(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: AssignConversationDto,
    @CurrentUser() actor: RequestUser,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.conversations.assign(id, dto, requestContext(actor, request));
  }

  @RequirePermissions("koral.conversations.manage")
  @RequireStepUp()
  @Post(":id/escalate")
  @HttpCode(HttpStatus.OK)
  escalate(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: EscalateConversationDto,
    @CurrentUser() actor: RequestUser,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.conversations.escalate(id, dto, requestContext(actor, request));
  }

  @RequirePermissions("koral.conversations.manage")
  @RequireStepUp()
  @Post(":id/status-transitions")
  @HttpCode(HttpStatus.OK)
  transitionStatus(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: TransitionConversationDto,
    @CurrentUser() actor: RequestUser,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.conversations.transitionStatus(id, dto, requestContext(actor, request));
  }

  @RequirePermissions("koral.conversations.manage")
  @RequireStepUp()
  @Post(":id/return-to-koral")
  @HttpCode(HttpStatus.OK)
  returnToKoral(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: ReturnToKoralDto,
    @CurrentUser() actor: RequestUser,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.conversations.returnToKoral(id, dto, requestContext(actor, request));
  }

  @RequirePermissions("koral.conversations.manage")
  @RequireStepUp()
  @Post(":id/release")
  @HttpCode(HttpStatus.OK)
  release(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: ReleaseConversationDto,
    @CurrentUser() actor: RequestUser,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.conversations.release(id, dto, requestContext(actor, request));
  }

  @RequirePermissions("koral.conversations.manage")
  @RequireStepUp()
  @Post(":id/priority")
  @HttpCode(HttpStatus.OK)
  changePriority(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: ChangeConversationPriorityDto,
    @CurrentUser() actor: RequestUser,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.conversations.changePriority(id, dto, requestContext(actor, request));
  }

  @RequirePermissions("koral.conversations.read")
  @Post(":id/read")
  @HttpCode(HttpStatus.OK)
  markRead(@Param("id", ParseUUIDPipe) id: string, @CurrentUser() actor: RequestUser) {
    return this.conversations.markRead(id, actor.id);
  }

  @RequirePermissions("koral.conversations.manage")
  @Post(":id/internal-notes")
  @HttpCode(HttpStatus.CREATED)
  addInternalNote(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: AddInternalNoteDto,
    @CurrentUser() actor: RequestUser,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.conversations.addInternalNote(id, dto, requestContext(actor, request));
  }
}

function requestContext(actor: RequestUser, request: AuthenticatedRequest) {
  const contextual = request as AuthenticatedRequest & { requestId?: string; correlationId?: string };
  return { actorUserId: actor.id, requestId: contextual.requestId, correlationId: contextual.correlationId };
}
