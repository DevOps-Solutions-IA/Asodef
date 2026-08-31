import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AuthModule } from "../auth/auth.module";
import { MasterModule } from "../master/master.module";
import { AffiliateSelfServiceController } from "./affiliate-self-service.controller";
import { CompanySelfServiceController } from "./company-self-service.controller";
import { SelfServicePaymentsController } from "./self-service-payments.controller";
import { EXTERNAL_CORE_PROVIDER, SELF_SERVICE_MESSAGE_PROVIDER } from "./external-core.provider";
import { NotConfiguredExternalCoreProvider, NotConfiguredSelfServiceMessageProvider } from "./not-configured.provider";
import { SelfServiceAccessService } from "./self-service-access.service";
import { SelfServiceCryptoService } from "./self-service-crypto.service";
import { SelfServiceCookieService, SelfServiceSessionService } from "./self-service-session.service";
import { SelfServiceCsrfGuard, SelfServiceSessionGuard } from "./self-service.guards";
import { SelfServiceGatewayService } from "./self-service-gateway.service";
import { SelfServiceProviderController } from "./self-service-provider.controller";
import { selectExternalCoreProvider, SelfServiceProviderRegistry } from "./self-service-provider.registry";
import { SelfServiceContactUpdateService } from "./self-service-contact-update.service";
import { HybridExternalCoreProvider } from "./hybrid-external-core.provider";

@Module({
  imports: [AuthModule, MasterModule],
  controllers: [AffiliateSelfServiceController, CompanySelfServiceController, SelfServicePaymentsController, SelfServiceProviderController],
  providers: [
    SelfServiceCryptoService,
    SelfServiceSessionService,
    SelfServiceCookieService,
    SelfServiceSessionGuard,
    SelfServiceCsrfGuard,
    SelfServiceAccessService,
    SelfServiceGatewayService,
    SelfServiceProviderRegistry,
    SelfServiceContactUpdateService,
    NotConfiguredExternalCoreProvider,
    HybridExternalCoreProvider,
    NotConfiguredSelfServiceMessageProvider,
    {
      provide: EXTERNAL_CORE_PROVIDER,
      inject: [ConfigService, NotConfiguredExternalCoreProvider, HybridExternalCoreProvider],
      useFactory: selectExternalCoreProvider,
    },
    { provide: SELF_SERVICE_MESSAGE_PROVIDER, useExisting: NotConfiguredSelfServiceMessageProvider },
  ],
  exports: [EXTERNAL_CORE_PROVIDER],
})
export class SelfServiceModule {}
