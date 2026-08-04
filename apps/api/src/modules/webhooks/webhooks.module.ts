import { Module } from "@nestjs/common";
import { PaymentProvidersModule } from "../payment-providers/payment-providers.module";
import { ReceiptsModule } from "../receipts/receipts.module";
import { AuditModule } from "../audit/audit.module";
import { BoldWebhookController } from "./bold-webhook.controller";
import { BoldWebhookService } from "./bold-webhook.service";

@Module({
  imports: [PaymentProvidersModule, ReceiptsModule, AuditModule],
  controllers: [BoldWebhookController],
  providers: [BoldWebhookService],
})
export class WebhooksModule {}
