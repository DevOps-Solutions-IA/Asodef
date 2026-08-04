import { Module } from "@nestjs/common";
import { PaymentProvidersModule } from "../payment-providers/payment-providers.module";
import { ReceiptsModule } from "../receipts/receipts.module";
import { AuditModule } from "../audit/audit.module";
import { BoldPaymentsController } from "./bold-payments.controller";
import { BoldPaymentsService } from "./bold-payments.service";

@Module({
  imports: [PaymentProvidersModule, ReceiptsModule, AuditModule],
  controllers: [BoldPaymentsController],
  providers: [BoldPaymentsService],
})
export class BoldPaymentsModule {}
