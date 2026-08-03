export interface OutboundEmailMessage {
  to: string;
  subject: string;
  textBody: string;
  templateVersion: string;
  correlationId: string;
}

export interface MailSendResult {
  delivered: boolean;
  providerMessageId?: string;
  failureReason?: string;
}

/**
 * Every concrete transport (SMTP, in-memory test double, no-op fallback)
 * implements this. send() must never throw - a delivery failure is a
 * normal, expected outcome represented by `{delivered: false,
 * failureReason}`, not an exception, so NotificationService never needs a
 * try/catch around a transport call.
 */
export interface MailTransport {
  send(message: OutboundEmailMessage): Promise<MailSendResult>;
}

/** DI token - MailTransport is a type-only interface and cannot itself be
 * used as an injection token. */
export const MAIL_TRANSPORT = Symbol("MAIL_TRANSPORT");
