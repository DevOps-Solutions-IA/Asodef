export interface OutboundEmailMessage {
  to: string;
  subject: string;
  textBody: string;
  templateVersion: string;
  correlationId: string;
  /** Stable outbox-job identity. Transports should propagate it as their
   * provider idempotency/message identity whenever supported. */
  idempotencyKey?: string;
}

export type MailSendResult =
  | { delivered: true; providerMessageId?: string }
  | {
      delivered: false;
      /** A permanent result is dead-lettered immediately; an uncertain
       * result is quarantined and never retried blindly. */
      disposition: "RETRYABLE" | "PERMANENT" | "UNCERTAIN";
      providerMessageId?: string;
      failureReason?: string;
    };

/**
 * Every concrete transport (SMTP, in-memory test double, no-op fallback)
 * implements this. send() must never throw - a delivery failure is a
 * normal, expected outcome represented by `{delivered: false, disposition,
 * failureReason}`, not an exception, so NotificationService never needs a
 * try/catch around a transport call.
 */
export interface MailTransport {
  send(message: OutboundEmailMessage): Promise<MailSendResult>;
  /** Technical capability probe only. It never sends a message and must not
   * expose transport configuration or provider error details. */
  checkHealth(): Promise<"AVAILABLE" | "UNAVAILABLE" | "NOT_CONFIGURED">;
}

/** DI token - MailTransport is a type-only interface and cannot itself be
 * used as an injection token. */
export const MAIL_TRANSPORT = Symbol("MAIL_TRANSPORT");
