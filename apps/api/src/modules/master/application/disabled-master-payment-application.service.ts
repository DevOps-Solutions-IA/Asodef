import { Injectable } from "@nestjs/common";
import type {
  ConfirmedMasterPaymentApplication,
  MasterPaymentApplicationPort,
  MasterPaymentApplicationResult,
} from "../ports/master-payment-application.port";

/**
 * Production-safe default until the official AdaSys payment-application
 * mechanism is identified and certified. It performs no I/O and no Firebird
 * mutation. Wiring this adapter is preferable to a nullable/optional write
 * dependency because callers always receive an explicit fail-closed result.
 */
@Injectable()
export class DisabledMasterPaymentApplicationService implements MasterPaymentApplicationPort {
  applyConfirmed(_input: ConfirmedMasterPaymentApplication): Promise<MasterPaymentApplicationResult> {
    return Promise.resolve({ status: "NOT_CONFIGURED" });
  }
}
