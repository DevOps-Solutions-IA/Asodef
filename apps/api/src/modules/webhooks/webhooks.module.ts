import { Module } from "@nestjs/common";
import { PaymentProvidersModule } from "../payment-providers/payment-providers.module";
import { ReceiptsModule } from "../receipts/receipts.module";
import { BoldWebhookController } from "./bold-webhook.controller";
import { BoldWebhookService } from "./bold-webhook.service";

@Module({
  imports: [PaymentProvidersModule, ReceiptsModule],
  controllers: [BoldWebhookController],
  providers: [BoldWebhookService],
})
export class WebhooksModule {}
