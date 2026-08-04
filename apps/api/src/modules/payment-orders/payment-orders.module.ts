import { Module } from "@nestjs/common";
import { PaymentOrdersService } from "./payment-orders.service";

/** No controller yet - US-023 is the domain service only. A later
 * story wires this into an HTTP route with the PRD's own exact
 * contract once one is defined. */
@Module({
  providers: [PaymentOrdersService],
  exports: [PaymentOrdersService],
})
export class PaymentOrdersModule {}
