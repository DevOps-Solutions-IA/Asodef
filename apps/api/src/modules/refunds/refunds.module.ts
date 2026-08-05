import { Module } from "@nestjs/common";
import { PaymentProvidersModule } from "../payment-providers/payment-providers.module";
import { AuditModule } from "../audit/audit.module";
import { RefundsController } from "./refunds.controller";
import { RefundsService } from "./refunds.service";

@Module({
  imports: [PaymentProvidersModule, AuditModule],
  controllers: [RefundsController],
  providers: [RefundsService],
})
export class RefundsModule {}
