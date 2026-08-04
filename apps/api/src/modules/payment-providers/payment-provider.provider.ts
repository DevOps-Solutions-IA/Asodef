import type { FactoryProvider } from "@nestjs/common";
import { PAYMENT_PROVIDER } from "./payment-provider.interface";
import { BoldPaymentProvider } from "./bold-payment-provider.service";

/**
 * Bold is the only implementation today, but consumers (a future
 * PaymentOrdersService, US-023+) inject PAYMENT_PROVIDER, never
 * BoldPaymentProvider directly - a future non-Bold provider selected by
 * config would only ever change this one factory.
 */
export const paymentProviderProvider: FactoryProvider = {
  provide: PAYMENT_PROVIDER,
  inject: [BoldPaymentProvider],
  useFactory: (boldPaymentProvider: BoldPaymentProvider) => boldPaymentProvider,
};
