import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
} from "@nestjs/common";
import { ApiCookieAuth, ApiTags } from "@nestjs/swagger";
import { Public } from "../auth/decorators/public.decorator";
import { RequirePermissions } from "../auth/decorators/permissions.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import type { RequestUser } from "../auth/types/request-user.type";
import type { AuthenticatedRequest } from "../auth/types/request-user.type";
import { buildRequestContext } from "../../common/http/request-context.util";
import { RateLimitedException } from "../auth/auth.service";
import { DataSubjectRequestsService } from "./data-subject-requests.service";
import { CreateDataSubjectRequestDto } from "./dto/create-data-subject-request.dto";
import { TransitionDataSubjectRequestDto } from "./dto/transition-data-subject-request.dto";
import { AssignDataSubjectRequestDto } from "./dto/assign-data-subject-request.dto";
import { ListDataSubjectRequestsQueryDto } from "./dto/list-data-subject-requests-query.dto";

const SAFE_RATE_LIMITED_MESSAGE = "Demasiadas solicitudes. Intenta nuevamente más tarde.";

@ApiTags("data-subject-requests")
@Controller()
export class DataSubjectRequestsController {
  constructor(private readonly dataSubjectRequestsService: DataSubjectRequestsService) {}

  @Public()
  @Post("data-subject-requests")
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateDataSubjectRequestDto, @Req() request: AuthenticatedRequest) {
    const context = buildRequestContext(request);
    try {
      return await this.dataSubjectRequestsService.create(dto, context.ipAddress ?? null);
    } catch (error) {
      if (error instanceof RateLimitedException) {
        throw new HttpException(
          { message: SAFE_RATE_LIMITED_MESSAGE, retryAfterSeconds: error.retryAfterSeconds },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
      throw error;
    }
  }

  /** Reference-only lookup (AC: "public, reference-only, no auth"). */
  @Public()
  @Get("data-subject-requests/:publicReference")
  findByPublicReference(@Param("publicReference") publicReference: string) {
    return this.dataSubjectRequestsService.findByPublicReference(publicReference);
  }

  @ApiCookieAuth("asodef_at")
  @RequirePermissions("data.manage")
  @Get("admin/data-subject-requests")
  list(@Query() query: ListDataSubjectRequestsQueryDto) {
    return this.dataSubjectRequestsService.list(query);
  }

  @ApiCookieAuth("asodef_at")
  @RequirePermissions("data.manage")
  @Get("admin/data-subject-requests/:id")
  findById(@Param("id", ParseUUIDPipe) id: string) {
    return this.dataSubjectRequestsService.findById(id);
  }

  @ApiCookieAuth("asodef_at")
  @RequirePermissions("data.manage")
  @Patch("admin/data-subject-requests/:id/assign")
  assign(@Param("id", ParseUUIDPipe) id: string, @Body() dto: AssignDataSubjectRequestDto, @CurrentUser() actor: RequestUser) {
    return this.dataSubjectRequestsService.assign(id, dto, actor.id);
  }

  @ApiCookieAuth("asodef_at")
  @RequirePermissions("data.manage")
  @Post("admin/data-subject-requests/:id/transition")
  @HttpCode(HttpStatus.OK)
  transition(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: TransitionDataSubjectRequestDto,
    @CurrentUser() actor: RequestUser,
  ) {
    return this.dataSubjectRequestsService.transition(id, dto, actor.id);
  }
}
