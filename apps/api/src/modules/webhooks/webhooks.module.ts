import { Module } from "@nestjs/common";
import { PaymentProvidersModule } from "../payment-providers/payment-providers.module";
import { PaymentOrdersModule } from "../payment-orders/payment-orders.module";
import { ReceiptsModule } from "../receipts/receipts.module";
import { AuditModule } from "../audit/audit.module";
import { BoldWebhookController } from "./bold-webhook.controller";
import { BoldWebhookService } from "./bold-webhook.service";
import { MasterBoldWebhookService } from "./master-bold-webhook.service";

@Module({
  imports: [PaymentProvidersModule, PaymentOrdersModule, ReceiptsModule, AuditModule],
  controllers: [BoldWebhookController],
  providers: [BoldWebhookService, MasterBoldWebhookService],
})
export class WebhooksModule {}
