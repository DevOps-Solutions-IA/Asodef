import { Module } from "@nestjs/common";
import { PaymentProvidersModule } from "../payment-providers/payment-providers.module";
import { PaymentOrdersModule } from "../payment-orders/payment-orders.module";
import { ReceiptsModule } from "../receipts/receipts.module";
import { AuditModule } from "../audit/audit.module";
import { BoldPaymentsController } from "./bold-payments.controller";
import { BoldPaymentsService } from "./bold-payments.service";
import { MasterBoldPaymentsService } from "./master-bold-payments.service";
import { MasterBoldWebhookService } from "./master-bold-webhook.service";

@Module({
  imports: [PaymentProvidersModule, PaymentOrdersModule, ReceiptsModule, AuditModule],
  controllers: [BoldPaymentsController],
  providers: [BoldPaymentsService, MasterBoldPaymentsService, MasterBoldWebhookService],
})
export class BoldPaymentsModule {}
