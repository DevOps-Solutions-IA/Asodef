import { Module } from "@nestjs/common";
import { PaymentOrdersController } from "./payment-orders.controller";
import { PaymentOrdersService } from "./payment-orders.service";

/** US-024 adds the controller; US-023 already shipped the domain
 * service. Exported so PaymentsLookupModule (also US-024) can reuse
 * the exact same service + response mapper for its reference-lookup
 * branch, rather than duplicating either. */
@Module({
  controllers: [PaymentOrdersController],
  providers: [PaymentOrdersService],
  exports: [PaymentOrdersService],
})
export class PaymentOrdersModule {}
