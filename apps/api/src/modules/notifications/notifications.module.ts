import { Module } from "@nestjs/common";
import { SecurityEventsModule } from "../../common/security-events/security-events.module";
import { NotificationService } from "./notification.service";
import { InMemoryMailTransport } from "./in-memory-mail.transport";
import { SmtpMailTransport } from "./smtp-mail.transport";
import { NoopMailTransport } from "./noop-mail.transport";
import { mailTransportProvider } from "./mail-transport.provider";
import { NotificationPayloadCryptoService } from "./notification-payload-crypto.service";

@Module({
  imports: [SecurityEventsModule],
  providers: [
    NotificationService,
    NotificationPayloadCryptoService,
    InMemoryMailTransport,
    SmtpMailTransport,
    NoopMailTransport,
    mailTransportProvider,
  ],
  exports: [NotificationService, InMemoryMailTransport],
})
export class NotificationsModule {}
