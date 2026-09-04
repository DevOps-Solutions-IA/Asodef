import { Module } from "@nestjs/common";
import { MasterModule } from "../master/master.module";
import { PaymentOrdersModule } from "../payment-orders/payment-orders.module";
import { PaymentsLookupController } from "./payments-lookup.controller";
import { PaymentsLookupService } from "./payments-lookup.service";

@Module({
  imports: [MasterModule, PaymentOrdersModule],
  controllers: [PaymentsLookupController],
  providers: [PaymentsLookupService],
})
export class PaymentsLookupModule {}
