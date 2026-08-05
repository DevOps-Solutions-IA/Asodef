import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { AppController } from "./app.controller";
import { validateEnv } from "./config/env.validation";
import { PrismaModule } from "./database/prisma.module";
import { RedisModule } from "./common/redis/redis.module";
import { HealthModule } from "./health/health.module";
import { AuthModule } from "./modules/auth/auth.module";
import { GovernanceModule } from "./modules/governance/governance.module";
import { AdminUsersModule } from "./modules/admin-users/admin-users.module";
import { LeadsModule } from "./modules/leads/leads.module";
import { ContentModule } from "./modules/content/content.module";
import { PaymentProvidersModule } from "./modules/payment-providers/payment-providers.module";
import { PaymentOrdersModule } from "./modules/payment-orders/payment-orders.module";
import { PaymentsLookupModule } from "./modules/payments-lookup/payments-lookup.module";
import { BoldPaymentsModule } from "./modules/bold-payments/bold-payments.module";
import { WebhooksModule } from "./modules/webhooks/webhooks.module";
import { ReceiptsModule } from "./modules/receipts/receipts.module";
import { LegalDocumentsModule } from "./modules/legal-documents/legal-documents.module";
import { ConsentModule } from "./modules/consent/consent.module";
import { CookieConsentModule } from "./modules/cookie-consent/cookie-consent.module";
import { DataSubjectRequestsModule } from "./modules/data-subject-requests/data-subject-requests.module";
import { RetentionReviewModule } from "./modules/retention/retention-review.module";
import { PqrCasesModule } from "./modules/pqr-cases/pqr-cases.module";
import { CrmModule } from "./modules/crm/crm.module";
import { PartnersModule } from "./modules/partners/partners.module";
import { ContractsModule } from "./modules/contracts/contracts.module";
import { RefundsModule } from "./modules/refunds/refunds.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      // Production reads real process env vars injected by Docker/systemd,
      // never a stray .env file sitting next to the code - see
      // infrastructure/.../docker-compose.production.yml (later story).
      ignoreEnvFile: true,
      validate: validateEnv,
    }),
    PrismaModule,
    RedisModule,
    HealthModule,
    AuthModule,
    GovernanceModule,
    AdminUsersModule,
    LeadsModule,
    ContentModule,
    PaymentProvidersModule,
    PaymentOrdersModule,
    PaymentsLookupModule,
    BoldPaymentsModule,
    WebhooksModule,
    ReceiptsModule,
    LegalDocumentsModule,
    ConsentModule,
    CookieConsentModule,
    DataSubjectRequestsModule,
    RetentionReviewModule,
    PqrCasesModule,
    CrmModule,
    PartnersModule,
    ContractsModule,
    RefundsModule,
  ],
  controllers: [AppController],
  providers: [],
})
export class AppModule {}
