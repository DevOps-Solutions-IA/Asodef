import { Module } from "@nestjs/common";
import { ContractsController } from "./contracts.controller";
import { ContractsService } from "./contracts.service";
import { ContractDownloadTokenService } from "./contract-download-token.service";
import { PlansModule } from "../plans/plans.module";

@Module({
  imports: [PlansModule],
  controllers: [ContractsController],
  providers: [ContractsService, ContractDownloadTokenService],
})
export class ContractsModule {}
