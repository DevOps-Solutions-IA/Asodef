import { Injectable } from "@nestjs/common";
import type { MailSendResult, MailTransport, OutboundEmailMessage } from "./mail-transport.interface";

/**
 * Used in NODE_ENV=test (and available for dev experimentation) so
 * nothing ever attempts a real network call, yet the exact message the
 * application tried to send - subject, body, correlation id - stays fully
 * inspectable in-process. This is the "test-only helper" the password
 * recovery flow relies on to obtain a raw reset token during tests: the
 * token only ever exists in the reset link inside a captured message
 * here, never in a log line or an API response body.
 */
@Injectable()
export class InMemoryMailTransport implements MailTransport {
  readonly sentMessages: OutboundEmailMessage[] = [];

  checkHealth(): Promise<"AVAILABLE"> {
    return Promise.resolve("AVAILABLE");
  }

  send(message: OutboundEmailMessage): Promise<MailSendResult> {
    this.sentMessages.push(message);
    return Promise.resolve({ delivered: true, providerMessageId: `in-memory-${this.sentMessages.length}` });
  }

  findLastMessageTo(recipient: string): OutboundEmailMessage | undefined {
    for (let i = this.sentMessages.length - 1; i >= 0; i -= 1) {
      const message = this.sentMessages[i];
      if (message && message.to === recipient) return message;
    }
    return undefined;
  }

  clear(): void {
    this.sentMessages.length = 0;
  }
}
