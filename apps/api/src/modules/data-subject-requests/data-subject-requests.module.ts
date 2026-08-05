import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { AuthModule } from "../auth/auth.module";
import { ConsentModule } from "../consent/consent.module";
import { LegalDocumentsModule } from "../legal-documents/legal-documents.module";
import { DataSubjectRequestsController } from "./data-subject-requests.controller";
import { DataSubjectRequestsService } from "./data-subject-requests.service";

@Module({
  imports: [AuditModule, AuthModule, ConsentModule, LegalDocumentsModule],
  controllers: [DataSubjectRequestsController],
  providers: [DataSubjectRequestsService],
})
export class DataSubjectRequestsModule {}
