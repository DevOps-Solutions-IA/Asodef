import type { FactoryProvider } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { EnvConfig } from "../../config/env.validation";
import { MAIL_TRANSPORT } from "./mail-transport.interface";
import { InMemoryMailTransport } from "./in-memory-mail.transport";
import { SmtpMailTransport } from "./smtp-mail.transport";
import { NoopMailTransport } from "./noop-mail.transport";

/**
 * Transport selection order:
 *  1. NODE_ENV=test always uses the in-memory transport - tests must
 *     never attempt a real network call, and must be able to inspect
 *     exactly what was "sent" (see InMemoryMailTransport's doc comment).
 *  2. SMTP_HOST configured -> real SmtpMailTransport.
 *  3. Otherwise -> NoopMailTransport, which fails safely and says so.
 */
export const mailTransportProvider: FactoryProvider = {
  provide: MAIL_TRANSPORT,
  inject: [ConfigService, InMemoryMailTransport, SmtpMailTransport, NoopMailTransport],
  useFactory: (
    configService: ConfigService<EnvConfig, true>,
    inMemory: InMemoryMailTransport,
    smtp: SmtpMailTransport,
    noop: NoopMailTransport,
  ) => {
    if (configService.get("NODE_ENV", { infer: true }) === "test") {
      return inMemory;
    }
    if (configService.get("SMTP_HOST", { infer: true })) {
      return smtp;
    }
    return noop;
  },
};
