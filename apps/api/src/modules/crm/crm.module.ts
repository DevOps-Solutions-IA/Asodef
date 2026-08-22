import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { CrmController } from "./crm.controller";
import { CrmService } from "./crm.service";
import { AdminBusinessIdempotencyService } from "./admin-business-idempotency.service";

@Module({
  imports: [AuditModule],
  controllers: [CrmController],
  providers: [CrmService, AdminBusinessIdempotencyService],
})
export class CrmModule {}
