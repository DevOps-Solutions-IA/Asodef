import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { LegalDocumentsModule } from "../legal-documents/legal-documents.module";
import { ConsentModule } from "../consent/consent.module";
import { PaymentOrdersController } from "./payment-orders.controller";
import { AdminPaymentOrdersController } from "./admin-payment-orders.controller";
import { MasterPaymentSelectionTokenService } from "./master-payment-selection-token.service";
import { PaymentOrdersService } from "./payment-orders.service";

/** US-024 adds the controller; US-023 already shipped the domain
 * service. Exported so PaymentsLookupModule (also US-024) can reuse
 * the exact same service + response mapper for its reference-lookup
 * branch, rather than duplicating either. */
@Module({
  imports: [AuditModule, LegalDocumentsModule, ConsentModule],
  controllers: [PaymentOrdersController, AdminPaymentOrdersController],
  providers: [PaymentOrdersService, MasterPaymentSelectionTokenService],
  exports: [PaymentOrdersService, MasterPaymentSelectionTokenService],
})
export class PaymentOrdersModule {}
