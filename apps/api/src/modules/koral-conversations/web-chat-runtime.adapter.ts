import { createHash, randomUUID } from "node:crypto";
import { BadRequestException, HttpException, HttpStatus } from "@nestjs/common";
import { ConversationChannel, ConversationStatus } from "@prisma/client";
import { RateLimiterService } from "../auth/rate-limiter.service";
import type { InboundMessage } from "./contracts/channel.contract";
import {
  KORAL_ORCHESTRATOR_CONTRACT_VERSION,
  type KoralOrchestrationPipeline,
  type KoralOrchestrationRunResult,
} from "./contracts/orchestrator.contract";
import { ConversationIdentityBindingService } from "./conversation-identity-binding.service";
import { KoralConversationsService } from "./koral-conversations.service";
import { KoralIdentityResolutionService } from "./identity-resolution.service";

export interface AuthenticatedWebChatPrincipal {
  userId: string;
  sessionId: string;
}

export interface WebChatRuntimeInput {
  message: InboundMessage;
  principal?: AuthenticatedWebChatPrincipal;
  deadlineAt: string;
}

export type WebChatRuntimeResult =
  | { kind: "DUPLICATE"; conversationId: string; messageId: string }
  | { kind: "HUMAN_ACTIVE"; conversationId: string; messageId: string }
  | { kind: "ORCHESTRATED"; conversationId: string; messageId: string; outcome: KoralOrchestrationRunResult };

/** Application-facing Web Chat boundary. Transport/controller work can be
 * added later without exposing gateway or persistence clients to a channel
 * adapter and without weakening server-authoritative identity evidence. */
export class KoralWebChatRuntimeAdapter {
  constructor(
    private readonly conversations: KoralConversationsService,
    private readonly identities: KoralIdentityResolutionService,
    private readonly bindings: ConversationIdentityBindingService,
    private readonly rateLimiter: RateLimiterService,
    private readonly orchestrator: KoralOrchestrationPipeline,
  ) {}

  async receive(input: WebChatRuntimeInput, now = new Date()): Promise<WebChatRuntimeResult> {
    if (input.message.channel !== ConversationChannel.WEB) throw new BadRequestException("WEB_CHANNEL_REQUIRED");
    const deadlineAt = validateDeadline(input.deadlineAt, now);
    const correlationId = input.message.correlationId?.trim() || randomUUID();
    const normalizedMessage = { ...input.message, correlationId };

    const rate = await this.rateLimiter.checkAndIncrementStrict(
      `koral:web:${digest(input.message.externalSessionId)}`,
      30,
      60,
    );
    if (rate.limited) {
      throw new HttpException({ code: "RATE_LIMITED", message: "Intenta nuevamente más tarde." }, HttpStatus.TOO_MANY_REQUESTS);
    }

    const receipt = await this.conversations.receiveInbound(normalizedMessage);
    if (receipt.duplicate) return { kind: "DUPLICATE", conversationId: receipt.conversationId, messageId: receipt.messageId };

    const resolved = input.principal
      ? await this.identities.resolveAuthenticated({
          channel: ConversationChannel.WEB,
          externalIdentityId: input.message.identity.externalIdentityId,
          userId: input.principal.userId,
          sessionId: input.principal.sessionId,
        }, now)
      : this.identities.resolveAnonymous({
          channel: ConversationChannel.WEB,
          externalIdentityId: input.message.identity.externalIdentityId,
        });

    await this.bindings.bind({
      conversationId: receipt.conversationId,
      identity: resolved.identity,
      reason: resolved.reason,
      evidenceReference: resolved.evidenceReference,
      correlationId,
      idempotencyKey: `web:${digest(`${input.message.externalSessionId}:${input.message.externalMessageId}`)}`,
    });

    const state = await this.conversations.getRuntimeState(receipt.conversationId);
    if (!state.mayAutoReply || state.status === ConversationStatus.HUMAN_ACTIVE) {
      return { kind: "HUMAN_ACTIVE", conversationId: receipt.conversationId, messageId: receipt.messageId };
    }
    const outcome = await this.orchestrator.run({
      version: KORAL_ORCHESTRATOR_CONTRACT_VERSION,
      normalizedMessageId: receipt.messageId,
      correlationId,
      deadlineAt,
    });
    return { kind: "ORCHESTRATED", conversationId: receipt.conversationId, messageId: receipt.messageId, outcome };
  }
}

function validateDeadline(value: string, now: Date): string {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp) || timestamp <= now.getTime() || timestamp > now.getTime() + 30_000) {
    throw new BadRequestException("INVALID_ORCHESTRATION_DEADLINE");
  }
  return new Date(timestamp).toISOString();
}

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 32);
}
