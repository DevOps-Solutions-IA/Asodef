import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseFilters,
  UseGuards,
} from "@nestjs/common";
import {
  ApiConflictResponse,
  ApiCookieAuth,
  ApiForbiddenResponse,
  ApiHeader,
  ApiNotFoundResponse,
  ApiOperation,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from "@nestjs/swagger";

import { CurrentUser } from "../../auth/decorators/current-user.decorator";
import { RequirePermissions } from "../../auth/decorators/permissions.decorator";
import type { RequestUser } from "../../auth/types/request-user.type";
import { ExecutionReasonDto, ConfirmWinnerDto } from "../contracts/admin";
import { BingoPageQueryDto } from "../contracts/common";
import {
  buildBingoCommandContext,
  type BingoAdminRequest,
} from "./bingo-admin-command-context";
import { BingoAdminCsrfGuard } from "./bingo-admin-csrf.guard";
import { BingoAdminErrorFilter } from "./bingo-admin-error.filter";
import { BingoAdminOperationsService } from "./bingo-admin-operations.service";
import { BingoAdminQueryService } from "./bingo-admin-query.service";

@ApiTags("bingo-admin")
@ApiCookieAuth("asodef_at")
@ApiForbiddenResponse({ description: "Sesión sin el permiso Bingo requerido." })
@UseGuards(BingoAdminCsrfGuard)
@UseFilters(BingoAdminErrorFilter)
@Controller("admin/bingo")
export class BingoAdminController {
  constructor(
    private readonly query: BingoAdminQueryService,
    private readonly operations: BingoAdminOperationsService,
  ) {}

  @Get("events")
  @RequirePermissions("bingo.read")
  @ApiOperation({ summary: "Lista eventos Bingo sin exponer PII" })
  listEvents(@Query() query: BingoPageQueryDto) {
    return this.query.listEvents(query);
  }

  @Get("events/:eventId")
  @RequirePermissions("bingo.read")
  @ApiNotFoundResponse({ description: "Evento inexistente." })
  getEvent(@Param("eventId", ParseUUIDPipe) eventId: string) {
    return this.query.getEvent(eventId);
  }

  @Get("executions/:executionId")
  @RequirePermissions("bingo.read")
  @ApiNotFoundResponse({ description: "Ejecución inexistente." })
  getExecution(@Param("executionId", ParseUUIDPipe) executionId: string) {
    return this.query.getExecution(executionId);
  }

  @Get("events/:eventId/audit")
  @RequirePermissions("bingo.audit.read")
  listAudit(
    @Param("eventId", ParseUUIDPipe) eventId: string,
    @Query() query: BingoPageQueryDto,
  ) {
    return this.query.listAudit(eventId, query);
  }

  @Post("executions/:executionId/start")
  @RequirePermissions("bingo.operate")
  @HttpCode(HttpStatus.OK)
  @MutationDocs("Inicia una ejecución oficial")
  start(
    @Param("executionId", ParseUUIDPipe) executionId: string,
    @Req() request: BingoAdminRequest,
    @CurrentUser() user: RequestUser,
  ) {
    return this.operations.start(executionId, contextFactory(request, user));
  }

  @Post("executions/:executionId/pause")
  @RequirePermissions("bingo.operate")
  @HttpCode(HttpStatus.OK)
  @MutationDocs("Pausa una ejecución oficial")
  pause(
    @Param("executionId", ParseUUIDPipe) executionId: string,
    @Req() request: BingoAdminRequest,
    @CurrentUser() user: RequestUser,
  ) {
    return this.operations.pause(executionId, contextFactory(request, user));
  }

  @Post("executions/:executionId/resume")
  @RequirePermissions("bingo.operate")
  @HttpCode(HttpStatus.OK)
  @MutationDocs("Reanuda una ejecución oficial")
  resume(
    @Param("executionId", ParseUUIDPipe) executionId: string,
    @Req() request: BingoAdminRequest,
    @CurrentUser() user: RequestUser,
  ) {
    return this.operations.resume(executionId, contextFactory(request, user));
  }

  @Post("executions/:executionId/complete")
  @RequirePermissions("bingo.operate")
  @HttpCode(HttpStatus.OK)
  @MutationDocs("Cierra una ejecución oficial")
  complete(
    @Param("executionId", ParseUUIDPipe) executionId: string,
    @Req() request: BingoAdminRequest,
    @CurrentUser() user: RequestUser,
  ) {
    return this.operations.complete(executionId, contextFactory(request, user));
  }

  @Post("executions/:executionId/cancel")
  @RequirePermissions("bingo.operate")
  @HttpCode(HttpStatus.OK)
  @MutationDocs("Cancela sin borrar evidencia")
  cancel(
    @Param("executionId", ParseUUIDPipe) executionId: string,
    @Body() body: ExecutionReasonDto,
    @Req() request: BingoAdminRequest,
    @CurrentUser() user: RequestUser,
  ) {
    return this.operations.cancel(
      executionId,
      body.reason,
      contextFactory(request, user),
    );
  }

  @Post("executions/:executionId/draws")
  @RequirePermissions("bingo.operate")
  @MutationDocs("Extrae y persiste la siguiente balota")
  draw(
    @Param("executionId", ParseUUIDPipe) executionId: string,
    @Req() request: BingoAdminRequest,
    @CurrentUser() user: RequestUser,
  ) {
    return this.operations.drawNext(executionId, contextFactory(request, user));
  }

  @Post("executions/:executionId/restart")
  @RequirePermissions("bingo.manage")
  @MutationDocs("Crea una nueva revisión de ejecución")
  restart(
    @Param("executionId", ParseUUIDPipe) executionId: string,
    @Body() body: ExecutionReasonDto,
    @Req() request: BingoAdminRequest,
    @CurrentUser() user: RequestUser,
  ) {
    return this.operations.restart(
      executionId,
      body.reason,
      contextFactory(request, user),
    );
  }

  @Post("candidates/:candidateId/validate")
  @RequirePermissions("bingo.validate")
  @HttpCode(HttpStatus.OK)
  @MutationDocs("Valida el grupo de candidatos simultáneos")
  validateCandidate(
    @Param("candidateId", ParseUUIDPipe) candidateId: string,
    @Req() request: BingoAdminRequest,
    @CurrentUser() user: RequestUser,
  ) {
    return this.operations.validateCandidate(
      candidateId,
      contextFactory(request, user),
    );
  }

  @Post("candidates/:candidateId/reject")
  @RequirePermissions("bingo.validate")
  @HttpCode(HttpStatus.OK)
  @MutationDocs("Rechaza el grupo con motivo obligatorio")
  rejectCandidate(
    @Param("candidateId", ParseUUIDPipe) candidateId: string,
    @Body() body: ExecutionReasonDto,
    @Req() request: BingoAdminRequest,
    @CurrentUser() user: RequestUser,
  ) {
    return this.operations.rejectCandidate(
      candidateId,
      body.reason,
      contextFactory(request, user),
    );
  }

  @Post("candidates/:candidateId/winners")
  @RequirePermissions("bingo.validate")
  @MutationDocs("Confirma todos los ganadores del empate oficial")
  confirmWinners(
    @Param("candidateId", ParseUUIDPipe) candidateId: string,
    @Body() body: ConfirmWinnerDto,
    @Req() request: BingoAdminRequest,
    @CurrentUser() user: RequestUser,
  ) {
    return this.operations.confirmWinners(
      candidateId,
      body.prizeId,
      contextFactory(request, user),
    );
  }
}

function contextFactory(request: BingoAdminRequest, user: RequestUser) {
  return (command: unknown) => buildBingoCommandContext(request, user, command);
}

function MutationDocs(summary: string): MethodDecorator {
  return (target, propertyKey, descriptor) => {
    ApiOperation({ summary })(target, propertyKey, descriptor);
    ApiHeader({
      name: "Idempotency-Key",
      required: true,
      description: "Clave opaca de 16 a 200 caracteres seguros, única por comando.",
    })(target, propertyKey, descriptor);
    ApiHeader({
      name: "Origin",
      required: true,
      description: "Origen exacto autorizado de la SPA administrativa.",
    })(target, propertyKey, descriptor);
    ApiConflictResponse({ description: "Conflicto de estado o idempotencia." })(
      target,
      propertyKey,
      descriptor,
    );
    ApiUnprocessableEntityResponse({ description: "Regla de dominio rechazada." })(
      target,
      propertyKey,
      descriptor,
    );
  };
}
