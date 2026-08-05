import { Module } from "@nestjs/common";
import { ApprovalGatesController } from "./approval-gates.controller";
import { ApprovalGatesService } from "./approval-gates.service";

@Module({
  controllers: [ApprovalGatesController],
  providers: [ApprovalGatesService],
  exports: [ApprovalGatesService],
})
export class ApprovalGatesModule {}
