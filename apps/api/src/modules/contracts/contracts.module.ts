import { Module } from "@nestjs/common";
import { ContractsController } from "./contracts.controller";
import { ContractsService } from "./contracts.service";
import { ContractDownloadTokenService } from "./contract-download-token.service";

@Module({
  controllers: [ContractsController],
  providers: [ContractsService, ContractDownloadTokenService],
})
export class ContractsModule {}
