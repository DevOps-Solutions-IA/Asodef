import { Module } from "@nestjs/common";

import { BingoAdminController } from "./bingo-admin.controller";
import { BingoAdminCsrfGuard } from "./bingo-admin-csrf.guard";
import { BingoAdminOperationsService } from "./bingo-admin-operations.service";
import { BingoAdminQueryService } from "./bingo-admin-query.service";

@Module({
  controllers: [BingoAdminController],
  providers: [
    BingoAdminCsrfGuard,
    BingoAdminOperationsService,
    BingoAdminQueryService,
  ],
})
export class BingoAdminModule {}
