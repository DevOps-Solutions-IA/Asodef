import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { AuthModule } from "../auth/auth.module";
import { PqrCasesController } from "./pqr-cases.controller";
import { PqrCasesService } from "./pqr-cases.service";

@Module({
  imports: [AuditModule, AuthModule],
  controllers: [PqrCasesController],
  providers: [PqrCasesService],
})
export class PqrCasesModule {}
