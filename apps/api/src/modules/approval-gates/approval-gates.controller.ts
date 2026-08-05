import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post } from "@nestjs/common";
import { ApiCookieAuth, ApiTags } from "@nestjs/swagger";
import { RequirePermissions } from "../auth/decorators/permissions.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import type { RequestUser } from "../auth/types/request-user.type";
import { ApprovalGatesService } from "./approval-gates.service";
import { TransitionApprovalGateDto } from "./dto/transition-approval-gate.dto";

@ApiTags("approval-gates")
@ApiCookieAuth("asodef_at")
@RequirePermissions("approvals.manage")
@Controller("admin/approval-gates")
export class ApprovalGatesController {
  constructor(private readonly approvalGatesService: ApprovalGatesService) {}

  @Get()
  listGates() {
    return this.approvalGatesService.listGates();
  }

  @Get("production-payments-status")
  async getProductionPaymentsStatus() {
    return { enabled: await this.approvalGatesService.isProductionPaymentsEnabled() };
  }

  @Get(":key")
  getGate(@Param("key") key: string) {
    return this.approvalGatesService.getGate(key);
  }

  @Post(":key/transition")
  @HttpCode(HttpStatus.OK)
  transition(@Param("key") key: string, @Body() dto: TransitionApprovalGateDto, @CurrentUser() actor: RequestUser) {
    return this.approvalGatesService.transition(key, dto, actor.id);
  }
}
