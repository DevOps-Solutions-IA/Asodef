import type { FactoryProvider } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { EnvConfig } from "../../config/env.validation";
import { PrismaService } from "../../database/prisma.service";
import { isProductionPaymentsEnabled } from "../approval-gates/is-production-payments-enabled";
import { BOLD_TRANSPORT } from "./bold-transport.interface";
import { MockBoldTransport } from "./mock-bold.transport";
import { HttpBoldTransport } from "./http-bold.transport";

/** Thrown at module-init time (effectively a startup failure, the same
 * way a NestFactory.create()/app.init() failure surfaces) - the AC's
 * own negative case: "instantiating BoldPaymentProvider without
 * BOLD_MODE=mock and without real credentials configured throws a
 * clear startup/config error rather than silently attempting a live
 * call." Never includes the (absent) credential value itself. */
export class BoldConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BoldConfigurationError";
  }
}

/**
 * Selection order mirrors mailTransportProvider's own pattern:
 *  - BOLD_MODE=mock (the default) -> MockBoldTransport, always, no
 *    credential requirement at all - this is what every test and local
 *    dev run uses.
 *  - BOLD_MODE=sandbox|production -> HttpBoldTransport, which requires
 *    BOLD_IDENTITY_KEY to be a non-empty, real-looking value; missing
 *    it fails fast here rather than silently falling through to a
 *    live call with an empty/invalid Authorization header.
 */
export const boldTransportProvider: FactoryProvider = {
  provide: BOLD_TRANSPORT,
  inject: [ConfigService, MockBoldTransport, PrismaService],
  useFactory: async (configService: ConfigService<EnvConfig, true>, mockTransport: MockBoldTransport, prisma: PrismaService) => {
    const mode = configService.get("BOLD_MODE", { infer: true });

    if (mode === "mock") {
      return mockTransport;
    }

    const identityKey = configService.get("BOLD_IDENTITY_KEY", { infer: true });
    if (!identityKey) {
      throw new BoldConfigurationError(
        `BOLD_MODE=${mode} requires BOLD_IDENTITY_KEY to be configured - refusing to start rather than attempt an unauthenticated live call`,
      );
    }

    // US-058 negative case, verbatim: "attempting to force BOLD_MODE=live
    // via config while any gate is not APPROVED causes the API to fail
    // startup/config validation rather than silently allowing live
    // payments." Only BOLD_MODE=production represents real customer
    // money moving - sandbox exercises Bold's real API with test
    // credentials, no business-approval gates implicated.
    if (mode === "production") {
      const allGatesApproved = await isProductionPaymentsEnabled(prisma);
      if (!allGatesApproved) {
        throw new BoldConfigurationError(
          "BOLD_MODE=production requires every ApprovalGate to be APPROVED and unexpired - refusing to start rather than silently allow live payments",
        );
      }
    }

    const baseUrl = configService.get("BOLD_BASE_URL", { infer: true });
    return new HttpBoldTransport({ baseUrl, identityKey });
  },
};
