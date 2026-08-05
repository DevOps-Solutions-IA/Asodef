import { Body, Controller, Get, HttpCode, HttpException, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Query, Req } from "@nestjs/common";
import { ApiCookieAuth, ApiTags } from "@nestjs/swagger";
import { Public } from "../auth/decorators/public.decorator";
import { RequirePermissions } from "../auth/decorators/permissions.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import type { RequestUser } from "../auth/types/request-user.type";
import type { AuthenticatedRequest } from "../auth/types/request-user.type";
import { buildRequestContext } from "../../common/http/request-context.util";
import { RateLimitedException } from "../auth/auth.service";
import { PqrCasesService } from "./pqr-cases.service";
import { CreatePqrCaseDto } from "./dto/create-pqr-case.dto";
import { TransitionPqrCaseDto } from "./dto/transition-pqr-case.dto";
import { AssignPqrCaseDto } from "./dto/assign-pqr-case.dto";
import { ListPqrCasesQueryDto } from "./dto/list-pqr-cases-query.dto";

const SAFE_RATE_LIMITED_MESSAGE = "Demasiadas solicitudes. Intenta nuevamente más tarde.";

@ApiTags("pqr-cases")
@Controller()
export class PqrCasesController {
  constructor(private readonly pqrCasesService: PqrCasesService) {}

  @Public()
  @Post("pqr-cases")
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreatePqrCaseDto, @Req() request: AuthenticatedRequest) {
    const context = buildRequestContext(request);
    try {
      return await this.pqrCasesService.create(dto, context);
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

  @Public()
  @Get("pqr-cases/:caseNumber")
  findByCaseNumber(@Param("caseNumber") caseNumber: string) {
    return this.pqrCasesService.findByCaseNumber(caseNumber);
  }

  @ApiCookieAuth("asodef_at")
  @RequirePermissions("pqr.manage")
  @Get("admin/pqr-cases")
  list(@Query() query: ListPqrCasesQueryDto) {
    return this.pqrCasesService.list(query);
  }

  @ApiCookieAuth("asodef_at")
  @RequirePermissions("pqr.manage")
  @Get("admin/pqr-cases/:id")
  findById(@Param("id", ParseUUIDPipe) id: string) {
    return this.pqrCasesService.findById(id);
  }

  @ApiCookieAuth("asodef_at")
  @RequirePermissions("pqr.manage")
  @Patch("admin/pqr-cases/:id/assign")
  assign(@Param("id", ParseUUIDPipe) id: string, @Body() dto: AssignPqrCaseDto, @CurrentUser() actor: RequestUser) {
    return this.pqrCasesService.assign(id, dto, actor.id);
  }

  @ApiCookieAuth("asodef_at")
  @RequirePermissions("pqr.manage")
  @Post("admin/pqr-cases/:id/transition")
  @HttpCode(HttpStatus.OK)
  transition(@Param("id", ParseUUIDPipe) id: string, @Body() dto: TransitionPqrCaseDto, @CurrentUser() actor: RequestUser) {
    return this.pqrCasesService.transition(id, dto, actor.id);
  }
}
