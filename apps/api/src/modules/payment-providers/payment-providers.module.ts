import { Module } from "@nestjs/common";
import { MockBoldTransport } from "./mock-bold.transport";
import { BoldPaymentProvider } from "./bold-payment-provider.service";
import { boldTransportProvider } from "./bold-transport.provider";
import { paymentProviderProvider } from "./payment-provider.provider";
import { PAYMENT_PROVIDER } from "./payment-provider.interface";

/**
 * No controller - this story is the provider adapter only (US-022).
 * Exports PAYMENT_PROVIDER for a later story's PaymentOrdersService
 * (US-023+) to inject, and MockBoldTransport itself so integration
 * tests elsewhere can reach into it (setNextPaymentStatus/reset) the
 * same way password-recovery tests reach into InMemoryMailTransport.
 */
@Module({
  providers: [MockBoldTransport, BoldPaymentProvider, boldTransportProvider, paymentProviderProvider],
  exports: [PAYMENT_PROVIDER, MockBoldTransport],
})
export class PaymentProvidersModule {}
