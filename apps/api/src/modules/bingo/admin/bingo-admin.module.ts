import { Module } from "@nestjs/common";

import { BingoAdminController } from "./bingo-admin.controller";
import { BingoAdminCsrfGuard } from "./bingo-admin-csrf.guard";
import { BingoAdminOperationsService } from "./bingo-admin-operations.service";
import { BingoAdminQueryService } from "./bingo-admin-query.service";
import { BingoAdminConfigurationService } from "./bingo-admin-configuration.service";

@Module({
  controllers: [BingoAdminController],
  providers: [
    BingoAdminCsrfGuard,
    BingoAdminOperationsService,
    BingoAdminQueryService,
    BingoAdminConfigurationService,
  ],
})
export class BingoAdminModule {}
