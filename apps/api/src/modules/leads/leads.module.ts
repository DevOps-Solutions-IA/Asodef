import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { LegalDocumentsModule } from "../legal-documents/legal-documents.module";
import { ConsentModule } from "../consent/consent.module";
import { LeadsController } from "./leads.controller";
import { LeadsService } from "./leads.service";

@Module({
  imports: [AuthModule, LegalDocumentsModule, ConsentModule],
  controllers: [LeadsController],
  providers: [LeadsService],
})
export class LeadsModule {}
