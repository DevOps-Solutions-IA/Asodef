import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { NotificationPayloadCryptoService } from "../notifications/notification-payload-crypto.service";

export interface EmailOutboxEnqueueInput {
  communicationId: string;
  recipients: readonly string[];
  subject: string;
  textBody: string;
  templateReference: string;
  correlationId: string;
}

/**
 * EMAIL adapter for Communications. It only appends encrypted jobs to the
 * existing PostgreSQL notification outbox. SMTP remains exclusively behind
 * NotificationService's worker and is never called here.
 */
@Injectable()
export class EmailOutboxAdapter {
  constructor(private readonly crypto: NotificationPayloadCryptoService) {}

  async enqueue(
    tx: Prisma.TransactionClient,
    input: EmailOutboxEnqueueInput,
  ): Promise<void> {
    for (const recipientEmail of input.recipients) {
      const payloadEncrypted = this.crypto.encrypt(
        JSON.stringify({
          subject: input.subject,
          textBody: input.textBody,
          templateVersion: input.templateReference,
          correlationId: input.correlationId,
        }),
      );
      await tx.notificationJob.create({
        data: {
          id: randomUUID(),
          type: "COMMUNICATION",
          recipientEmail,
          userId: null,
          communicationId: input.communicationId,
          correlationId: input.correlationId,
          templateVersion: input.templateReference,
          payloadEncrypted,
          maxAttempts: 5,
        },
      });
    }
  }
}
