import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Query, Req } from "@nestjs/common";
import { ApiCookieAuth, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { RequirePermissions } from "../auth/decorators/permissions.decorator";
import { RequireStepUp } from "../auth/decorators/require-step-up.decorator";
import type { AuthenticatedRequest, RequestUser } from "../auth/types/request-user.type";
import { AddInternalNoteDto } from "./dto/add-internal-note.dto";
import { AssignConversationDto } from "./dto/assign-conversation.dto";
import { ListConversationsQueryDto } from "./dto/list-conversations-query.dto";
import { ReturnToKoralDto } from "./dto/return-to-koral.dto";
import { KoralConversationsService } from "./koral-conversations.service";

@ApiTags("koral-conversations")
@ApiCookieAuth("asodef_at")
@Controller("admin/koral/conversations")
export class KoralConversationsController {
  constructor(private readonly conversations: KoralConversationsService) {}

  @RequirePermissions("koral.conversations.read")
  @Get()
  list(@Query() query: ListConversationsQueryDto) {
    return this.conversations.list(query);
  }

  @RequirePermissions("koral.conversations.read")
  @Get(":id")
  findById(@Param("id", ParseUUIDPipe) id: string) {
    return this.conversations.findById(id);
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
