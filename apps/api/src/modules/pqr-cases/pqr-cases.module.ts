import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { AuthModule } from "../auth/auth.module";
import { ConsentModule } from "../consent/consent.module";
import { LegalDocumentsModule } from "../legal-documents/legal-documents.module";
import { PqrCasesController } from "./pqr-cases.controller";
import { PqrCasesService } from "./pqr-cases.service";

@Module({
  imports: [AuditModule, AuthModule, ConsentModule, LegalDocumentsModule],
  controllers: [PqrCasesController],
  providers: [PqrCasesService],
})
export class PqrCasesModule {}
