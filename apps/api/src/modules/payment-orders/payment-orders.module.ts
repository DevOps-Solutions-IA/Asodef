import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { LegalDocumentsModule } from "../legal-documents/legal-documents.module";
import { ConsentModule } from "../consent/consent.module";
import { MasterModule } from "../master/master.module";
import { PaymentOrdersController } from "./payment-orders.controller";
import { AdminPaymentOrdersController } from "./admin-payment-orders.controller";
import { MasterPaymentOrdersService } from "./master-payment-orders.service";
import { MasterPaymentPreflightService } from "./master-payment-preflight.service";
import { MasterPaymentSelectionTokenService } from "./master-payment-selection-token.service";
import { PaymentOrdersService } from "./payment-orders.service";

@Module({
  imports: [AuditModule, LegalDocumentsModule, ConsentModule, MasterModule],
  controllers: [PaymentOrdersController, AdminPaymentOrdersController],
  providers: [
    PaymentOrdersService,
    MasterPaymentSelectionTokenService,
    MasterPaymentPreflightService,
    MasterPaymentOrdersService,
  ],
  exports: [
    PaymentOrdersService,
    MasterPaymentSelectionTokenService,
    MasterPaymentPreflightService,
    MasterPaymentOrdersService,
  ],
})
export class PaymentOrdersModule {}
