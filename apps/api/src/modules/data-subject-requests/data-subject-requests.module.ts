import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { AuthModule } from "../auth/auth.module";
import { DataSubjectRequestsController } from "./data-subject-requests.controller";
import { DataSubjectRequestsService } from "./data-subject-requests.service";

@Module({
  imports: [AuditModule, AuthModule],
  controllers: [DataSubjectRequestsController],
  providers: [DataSubjectRequestsService],
})
export class DataSubjectRequestsModule {}
