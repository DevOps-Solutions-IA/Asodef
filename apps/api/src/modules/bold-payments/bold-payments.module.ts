import { Module } from "@nestjs/common";
import { PaymentProvidersModule } from "../payment-providers/payment-providers.module";
import { BoldPaymentsController } from "./bold-payments.controller";
import { BoldPaymentsService } from "./bold-payments.service";

@Module({
  imports: [PaymentProvidersModule],
  controllers: [BoldPaymentsController],
  providers: [BoldPaymentsService],
})
export class BoldPaymentsModule {}
