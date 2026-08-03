import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Query, Req } from "@nestjs/common";
import { ApiCookieAuth, ApiTags } from "@nestjs/swagger";
import { RequirePermissions } from "../auth/decorators/permissions.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { buildRequestContext } from "../../common/http/request-context.util";
import type { AuthenticatedRequest, RequestUser } from "../auth/types/request-user.type";
import { AdminUsersService } from "./admin-users.service";
import { ListUsersQueryDto } from "./dto/list-users-query.dto";
import { CreateUserDto } from "./dto/create-user.dto";
import { UpdateUserDto } from "./dto/update-user.dto";
import { ReasonDto } from "./dto/reason.dto";
import { RevokeSessionDto } from "./dto/revoke-session.dto";
import { RoleChangeDto } from "./dto/role-change.dto";
import { SecurityEventsQueryDto } from "./dto/security-events-query.dto";

@ApiTags("admin-users")
@ApiCookieAuth("asodef_at")
@Controller("admin/users")
export class AdminUsersController {
  constructor(private readonly adminUsersService: AdminUsersService) {}

  @RequirePermissions("users.read")
  @Get("stats")
  getStats() {
    return this.adminUsersService.getStats();
  }

  @RequirePermissions("users.read")
  @Get()
  listUsers(@Query() query: ListUsersQueryDto) {
    return this.adminUsersService.listUsers(query);
  }

  @RequirePermissions("users.create")
  @Post()
  @HttpCode(HttpStatus.CREATED)
  createUser(@CurrentUser() actor: RequestUser, @Body() dto: CreateUserDto, @Req() request: AuthenticatedRequest) {
    return this.adminUsersService.createUser(actor, dto, buildRequestContext(request));
  }

  @RequirePermissions("users.read")
  @Get(":userId")
  getUserDetail(@Param("userId", ParseUUIDPipe) userId: string) {
    return this.adminUsersService.getUserDetail(userId);
  }

  @RequirePermissions("users.update")
  @Patch(":userId")
  updateUser(
    @CurrentUser() actor: RequestUser,
    @Param("userId", ParseUUIDPipe) userId: string,
    @Body() dto: UpdateUserDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.adminUsersService.updateUser(actor, userId, dto, buildRequestContext(request));
  }

  @RequirePermissions("users.deactivate")
  @Post(":userId/deactivate")
  @HttpCode(HttpStatus.OK)
  deactivateUser(
    @CurrentUser() actor: RequestUser,
    @Param("userId", ParseUUIDPipe) userId: string,
    @Body() dto: ReasonDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.adminUsersService.deactivateUser(actor, userId, dto.reason, buildRequestContext(request));
  }

  @RequirePermissions("users.reactivate")
  @Post(":userId/reactivate")
  @HttpCode(HttpStatus.OK)
  reactivateUser(
    @CurrentUser() actor: RequestUser,
    @Param("userId", ParseUUIDPipe) userId: string,
    @Body() dto: ReasonDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.adminUsersService.reactivateUser(actor, userId, dto.reason, buildRequestContext(request));
  }

  @RequirePermissions("users.unlock")
  @Post(":userId/unlock")
  @HttpCode(HttpStatus.OK)
  unlockUser(
    @CurrentUser() actor: RequestUser,
    @Param("userId", ParseUUIDPipe) userId: string,
    @Body() dto: ReasonDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.adminUsersService.unlockUser(actor, userId, dto.reason, buildRequestContext(request));
  }

  @RequirePermissions("users.roles.manage")
  @Get(":userId/roles")
  getRoles(@Param("userId", ParseUUIDPipe) userId: string) {
    return this.adminUsersService.getRoles(userId);
  }

  @RequirePermissions("users.roles.manage")
  @Post(":userId/roles")
  @HttpCode(HttpStatus.OK)
  assignRole(@CurrentUser() actor: RequestUser, @Param("userId", ParseUUIDPipe) userId: string, @Body() dto: RoleChangeDto) {
    return this.adminUsersService.assignRole(actor, userId, dto);
  }

  @RequirePermissions("users.roles.manage")
  @Post(":userId/roles/revoke")
  @HttpCode(HttpStatus.OK)
  removeRole(@CurrentUser() actor: RequestUser, @Param("userId", ParseUUIDPipe) userId: string, @Body() dto: RoleChangeDto) {
    return this.adminUsersService.removeRole(actor, userId, dto);
  }

  @RequirePermissions("users.sessions.read")
  @Get(":userId/sessions")
  listSessions(@CurrentUser() actor: RequestUser, @Param("userId", ParseUUIDPipe) userId: string) {
    return this.adminUsersService.listSessions(actor, userId);
  }

  @RequirePermissions("users.sessions.revoke")
  @Post(":userId/sessions/revoke")
  @HttpCode(HttpStatus.OK)
  revokeSessions(
    @CurrentUser() actor: RequestUser,
    @Param("userId", ParseUUIDPipe) userId: string,
    @Body() dto: RevokeSessionDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.adminUsersService.revokeSessions(actor, userId, dto, buildRequestContext(request));
  }

  @RequirePermissions("users.security.read")
  @Get(":userId/security-events")
  listSecurityEvents(@Param("userId", ParseUUIDPipe) userId: string, @Query() query: SecurityEventsQueryDto) {
    return this.adminUsersService.listSecurityEvents(userId, query);
  }
}
