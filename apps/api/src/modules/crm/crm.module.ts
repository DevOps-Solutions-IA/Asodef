import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { CrmController } from "./crm.controller";
import { CrmService } from "./crm.service";

@Module({
  imports: [AuditModule],
  controllers: [CrmController],
  providers: [CrmService],
})
export class CrmModule {}
