import type { FactoryProvider } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { EnvConfig } from "../../config/env.validation";
import { PrismaService } from "../../database/prisma.service";
import { isProductionPaymentsEnabled } from "../approval-gates/is-production-payments-enabled";
import { BOLD_TRANSPORT } from "./bold-transport.interface";
import { MockBoldTransport } from "./mock-bold.transport";
import { HttpBoldTransport } from "./http-bold.transport";

export class BoldConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BoldConfigurationError";
  }
}

export const boldTransportProvider: FactoryProvider = {
  provide: BOLD_TRANSPORT,
  inject: [ConfigService, MockBoldTransport, PrismaService],
  useFactory: async (configService: ConfigService<EnvConfig, true>, mockTransport: MockBoldTransport, prisma: PrismaService) => {
    const mode = configService.get("BOLD_MODE", { infer: true });

    if (mode === "mock") return mockTransport;

    const identityKey = configService.get("BOLD_IDENTITY_KEY", { infer: true });
    if (!identityKey) {
      throw new BoldConfigurationError(
        `BOLD_MODE=${mode} requires BOLD_IDENTITY_KEY to be configured - refusing to start rather than attempt an unauthenticated live call`,
      );
    }

    if (mode === "production") {
      const webhookSecret = configService.get("BOLD_WEBHOOK_SECRET", { infer: true });
      if (!webhookSecret) {
        throw new BoldConfigurationError(
          "BOLD_MODE=production requires BOLD_WEBHOOK_SECRET to verify payment notifications - refusing to start with an unverifiable live-money webhook",
        );
      }

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
