import { Module } from "@nestjs/common";
import { PaymentOrdersModule } from "../payment-orders/payment-orders.module";
import { PaymentsLookupController } from "./payments-lookup.controller";
import { PaymentsLookupService } from "./payments-lookup.service";

@Module({
  imports: [PaymentOrdersModule],
  controllers: [PaymentsLookupController],
  providers: [PaymentsLookupService],
})
export class PaymentsLookupModule {}
