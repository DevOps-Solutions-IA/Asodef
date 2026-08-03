import { Injectable, Logger } from "@nestjs/common";
import type { MailSendResult, MailTransport, OutboundEmailMessage } from "./mail-transport.interface";

/**
 * Selected whenever SMTP_HOST is not configured (any environment). Never
 * claims a message was delivered - it fails safely and explicitly, so a
 * missing mail configuration in production is loudly visible in
 * NotificationJob.failureReason instead of silently pretending to work.
 * Logs only safe, non-sensitive fields (recipient + correlation id) -
 * never the subject/body, which is where a reset link would live.
 */
@Injectable()
export class NoopMailTransport implements MailTransport {
  private readonly logger = new Logger(NoopMailTransport.name);

  send(message: OutboundEmailMessage): Promise<MailSendResult> {
    this.logger.warn(
      `Mail transport not configured - not sending message to ${message.to} (correlationId=${message.correlationId})`,
    );
    return Promise.resolve({ delivered: false, failureReason: "SMTP_NOT_CONFIGURED" });
  }
}
