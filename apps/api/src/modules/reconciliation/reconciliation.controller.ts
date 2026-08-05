import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post } from "@nestjs/common";
import { ApiCookieAuth, ApiTags } from "@nestjs/swagger";
import { RequirePermissions } from "../auth/decorators/permissions.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import type { RequestUser } from "../auth/types/request-user.type";
import { ReconciliationService } from "./reconciliation.service";
import { RunReconciliationDto } from "./dto/run-reconciliation.dto";
import { ResolveDifferenceDto } from "./dto/resolve-difference.dto";

@ApiTags("reconciliation")
@ApiCookieAuth("asodef_at")
@RequirePermissions("payments.reconcile")
@Controller("admin/reconciliation")
export class ReconciliationController {
  constructor(private readonly reconciliationService: ReconciliationService) {}

  @Post("runs")
  @HttpCode(HttpStatus.CREATED)
  run(@Body() dto: RunReconciliationDto, @CurrentUser() actor: RequestUser) {
    return this.reconciliationService.run(dto, actor.id);
  }

  @Get("runs")
  listRuns() {
    return this.reconciliationService.listRuns();
  }

  @Get("runs/:id")
  getRun(@Param("id", ParseUUIDPipe) id: string) {
    return this.reconciliationService.getRun(id);
  }

  @Get("runs/:id/differences")
  listDifferences(@Param("id", ParseUUIDPipe) id: string) {
    return this.reconciliationService.listDifferences(id);
  }

  @Post("differences/:id/resolve")
  @HttpCode(HttpStatus.OK)
  resolveDifference(@Param("id", ParseUUIDPipe) id: string, @Body() dto: ResolveDifferenceDto) {
    return this.reconciliationService.resolveDifference(id, dto);
  }
}
