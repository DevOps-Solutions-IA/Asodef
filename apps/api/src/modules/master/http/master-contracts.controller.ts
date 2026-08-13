import { Controller, Get, Param } from "@nestjs/common";
import { ApiCookieAuth, ApiTags } from "@nestjs/swagger";
import { RequirePermissions } from "../../auth/decorators/permissions.decorator";
import { MasterContractSummaryService } from "../application/master-contract-summary.service";

@ApiTags("master")
@Controller("admin/master")
export class MasterContractsController {
  constructor(
    private readonly masterContractSummaryService: MasterContractSummaryService,
  ) {}

  @ApiCookieAuth("asodef_at")
  @RequirePermissions("contracts.read")
  @Get("contracts/:contractId/summary")
  getContractSummary(@Param("contractId") contractId: string) {
    return this.masterContractSummaryService.getSummary(contractId);
  }
}
