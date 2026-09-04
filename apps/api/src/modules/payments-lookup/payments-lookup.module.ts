import { Module } from "@nestjs/common";
import { MasterModule } from "../master/master.module";
import { PaymentOrdersModule } from "../payment-orders/payment-orders.module";
import { MasterPaymentSelectionTokenService } from "./master-payment-selection-token.service";
import { PaymentsLookupController } from "./payments-lookup.controller";
import { PaymentsLookupService } from "./payments-lookup.service";

@Module({
  imports: [MasterModule, PaymentOrdersModule],
  controllers: [PaymentsLookupController],
  providers: [PaymentsLookupService, MasterPaymentSelectionTokenService],
  exports: [MasterPaymentSelectionTokenService],
})
export class PaymentsLookupModule {}
