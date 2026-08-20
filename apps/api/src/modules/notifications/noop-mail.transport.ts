import { Injectable, Logger } from "@nestjs/common";
import type { MailSendResult, MailTransport, OutboundEmailMessage } from "./mail-transport.interface";

/**
 * Selected whenever SMTP_HOST is not configured (any environment). Never
 * claims a message was delivered - it fails safely and explicitly, so a
 * missing mail configuration in production is loudly visible in
 * NotificationJob.failureReason instead of silently pretending to work.
 * Logs only the correlation id - never recipient, subject or body.
 */
@Injectable()
export class NoopMailTransport implements MailTransport {
  private readonly logger = new Logger(NoopMailTransport.name);

  checkHealth(): Promise<"NOT_CONFIGURED"> {
    return Promise.resolve("NOT_CONFIGURED");
  }

  send(message: OutboundEmailMessage): Promise<MailSendResult> {
    this.logger.warn(
      `Mail transport not configured (correlationId=${message.correlationId})`,
    );
    return Promise.resolve({
      delivered: false,
      // Preserve queued work for a bounded retry after operators restore
      // configuration; the transport still never claims delivery.
      disposition: "RETRYABLE",
      failureReason: "SMTP_NOT_CONFIGURED",
    });
  }
}
