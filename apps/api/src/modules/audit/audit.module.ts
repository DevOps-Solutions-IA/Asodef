import { Module } from "@nestjs/common";
import { AuditService } from "./audit.service";
import { AuditController } from "./audit.controller";
import { AuditTimelineService } from "./audit-timeline.service";

@Module({
  controllers: [AuditController],
  providers: [AuditService, AuditTimelineService],
  exports: [AuditService],
})
export class AuditModule {}
