import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { LegalDocumentsController } from "./legal-documents.controller";
import { LegalDocumentsService } from "./legal-documents.service";

@Module({
  imports: [AuditModule],
  controllers: [LegalDocumentsController],
  providers: [LegalDocumentsService],
  exports: [LegalDocumentsService],
})
export class LegalDocumentsModule {}
