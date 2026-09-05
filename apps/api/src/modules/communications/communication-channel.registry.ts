import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import type { CommunicationChannel } from "@asodef/connect-contracts";
import {
  EmailOutboxAdapter,
  type EmailOutboxEnqueueInput,
} from "./email-outbox.adapter";
import { CommunicationsRuntimeError } from "./communications-runtime.error";

export type CommunicationChannelCapability = Readonly<{
  channel: CommunicationChannel;
  runtime: "AVAILABLE" | "CONTRACT_ONLY";
  adapter: "ENCRYPTED_NOTIFICATION_OUTBOX" | null;
}>;

const CAPABILITIES: Readonly<Record<CommunicationChannel, CommunicationChannelCapability>> = {
  EMAIL: {
    channel: "EMAIL",
    runtime: "AVAILABLE",
    adapter: "ENCRYPTED_NOTIFICATION_OUTBOX",
  },
  WHATSAPP: { channel: "WHATSAPP", runtime: "CONTRACT_ONLY", adapter: null },
  WEB_NOTIFICATION: {
    channel: "WEB_NOTIFICATION",
    runtime: "CONTRACT_ONLY",
    adapter: null,
  },
  // FUTURE is the contract extension point for providers such as Meta.
  FUTURE: { channel: "FUTURE", runtime: "CONTRACT_ONLY", adapter: null },
};

/**
 * Runtime channel boundary. External providers are intentionally absent: only
 * EMAIL may append to the existing encrypted notification outbox.
 */
@Injectable()
export class CommunicationChannelRegistry {
  constructor(private readonly email: EmailOutboxAdapter) {}

  capability(channel: CommunicationChannel): CommunicationChannelCapability | null {
    return CAPABILITIES[channel] ?? null;
  }

  assertAvailable(channel: CommunicationChannel): void {
    if (this.capability(channel)?.runtime !== "AVAILABLE") {
      throw new CommunicationsRuntimeError("TRANSPORT_NOT_AVAILABLE", false);
    }
  }

  async dispatch(
    tx: Prisma.TransactionClient,
    channel: CommunicationChannel,
    input: EmailOutboxEnqueueInput,
  ): Promise<void> {
    this.assertAvailable(channel);
    if (channel !== "EMAIL") {
      throw new CommunicationsRuntimeError("TRANSPORT_NOT_AVAILABLE", false);
    }
    await this.email.enqueue(tx, input);
  }
}
