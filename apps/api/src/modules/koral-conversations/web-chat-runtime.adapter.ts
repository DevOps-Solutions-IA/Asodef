import { createHash, randomUUID } from "node:crypto";
import { BadRequestException, HttpException, HttpStatus, Inject, Injectable, Optional, ServiceUnavailableException } from "@nestjs/common";
import { ConversationChannel, ConversationStatus, WebChatProcessingStatus } from "@prisma/client";
import { RateLimitDependencyUnavailableError, RateLimiterService } from "../auth/rate-limiter.service";
import type { InboundMessage } from "./contracts/channel.contract";
import {
  KORAL_ORCHESTRATOR_CONTRACT_VERSION,
  KORAL_ORCHESTRATION_PIPELINE,
  type KoralOrchestrationPipeline,
  type KoralOrchestrationRunResult,
} from "./contracts/orchestrator.contract";
import { ConversationIdentityBindingService } from "./conversation-identity-binding.service";
import { KoralConversationsService } from "./koral-conversations.service";
import { KoralIdentityResolutionService } from "./identity-resolution.service";
import { WebChatMessageProcessingService } from "./web-chat-message-processing.service";
import type { WebChatSessionFence } from "./web-chat-session-lock";

export interface AuthenticatedWebChatPrincipal {
  userId: string;
  sessionId: string;
}

export interface WebChatRuntimeInput {
  sessionFence: WebChatSessionFence;
  payloadHash: string;
  message: InboundMessage;
  principal?: AuthenticatedWebChatPrincipal;
  claimed?: { identityId: string; evidenceReference: string };
  deadlineAt: string;
}

export type WebChatRuntimeResult =
  | { kind: "DUPLICATE"; conversationId: string; messageId: string }
  | { kind: "SUPPRESSED"; conversationId: string; messageId: string; reason: "HUMAN_HANDOFF" | "ACTIVE_ASSIGNMENT" | "RUNTIME_UNAVAILABLE" | "PROCESSING_ACTIVE" | "PROCESSING_FAILED" | "UNKNOWN_RESULT"; status: ConversationStatus }
  | { kind: "ORCHESTRATED"; conversationId: string; messageId: string; outcome: KoralOrchestrationRunResult };

/** Application-facing Web Chat boundary. Transport/controller work can be
 * added later without exposing gateway or persistence clients to a channel
 * adapter and without weakening server-authoritative identity evidence. */
@Injectable()
export class KoralWebChatRuntimeAdapter {
  constructor(
    private readonly conversations: KoralConversationsService,
    private readonly identities: KoralIdentityResolutionService,
    private readonly bindings: ConversationIdentityBindingService,
    private readonly processing: WebChatMessageProcessingService,
    private readonly rateLimiter: RateLimiterService,
    @Optional() @Inject(KORAL_ORCHESTRATION_PIPELINE) private readonly orchestrator?: KoralOrchestrationPipeline,
  ) {}

  get orchestrationAvailable(): boolean {
    return this.orchestrator?.available === true;
  }

  async receive(input: WebChatRuntimeInput, now = new Date()): Promise<WebChatRuntimeResult> {
    if (input.message.channel !== ConversationChannel.WEB) throw new BadRequestException("WEB_CHANNEL_REQUIRED");
    const deadlineAt = validateDeadline(input.deadlineAt, now);
    const correlationId = input.message.correlationId?.trim() || randomUUID();
    const normalizedMessage = { ...input.message, correlationId };

    let rate;
    try {
      rate = await this.rateLimiter.checkAndIncrementStrict(
        `koral:web:${digest(input.message.externalSessionId)}`,
        30,
        60,
      );
    } catch (error) {
      if (error instanceof RateLimitDependencyUnavailableError) {
        throw new ServiceUnavailableException({ code: "WEB_CHAT_SECURITY_DEPENDENCY_UNAVAILABLE", message: "El chat no está disponible temporalmente." });
      }
      throw error;
    }
    if (rate.limited) {
      throw new HttpException({ code: "RATE_LIMITED", message: "Intenta nuevamente más tarde." }, HttpStatus.TOO_MANY_REQUESTS);
    }

    const resolved = input.principal
      ? await this.identities.resolveAuthenticated({
          channel: ConversationChannel.WEB,
          externalIdentityId: input.message.identity.externalIdentityId,
          userId: input.principal.userId,
          sessionId: input.principal.sessionId,
        }, now)
      : input.claimed
        ? this.identities.resolveClaimed({
            channel: ConversationChannel.WEB,
            externalIdentityId: input.message.identity.externalIdentityId,
            claimedIdentityId: input.claimed.identityId,
            evidenceReference: input.claimed.evidenceReference,
          })
        : this.identities.resolveAnonymous({
          channel: ConversationChannel.WEB,
          externalIdentityId: input.message.identity.externalIdentityId,
          });

    // Authentication evidence is resolved before persistence. A forged,
    // revoked or expired principal therefore fails closed without leaving a
    // message that appears accepted but can never be processed.
    const receipt = await this.conversations.receiveWebChatInbound(
      normalizedMessage,
      input.sessionFence,
      input.payloadHash,
      async (tx, conversationId) => {
        await this.bindings.bindInTransaction(tx, {
          conversationId,
          identity: resolved.identity,
          reason: resolved.reason,
          evidenceReference: resolved.evidenceReference,
          correlationId,
          idempotencyKey: `web:${digest(`${input.message.externalSessionId}:${input.message.externalMessageId}`)}`,
        }, true);
      },
    );
    if (
      receipt.processingStatus === WebChatProcessingStatus.COMPLETED
      || receipt.processingStatus === WebChatProcessingStatus.SUPPRESSED
    ) return { kind: "DUPLICATE", conversationId: receipt.conversationId, messageId: receipt.messageId };

    const state = await this.conversations.getRuntimeState(receipt.conversationId);
    if (!state.mayAutoReply || state.status === ConversationStatus.HUMAN_REQUIRED || state.status === ConversationStatus.HUMAN_ACTIVE) {
      const reason = state.hasActiveAssignment ? "ACTIVE_ASSIGNMENT" as const : "HUMAN_HANDOFF" as const;
      await this.processing.suppress(receipt.messageId, input.sessionFence, correlationId, reason);
      return {
        kind: "SUPPRESSED",
        conversationId: receipt.conversationId,
        messageId: receipt.messageId,
        reason,
        status: state.status,
      };
    }
    if (!this.orchestrator) {
      return { kind: "SUPPRESSED", conversationId: receipt.conversationId, messageId: receipt.messageId, reason: "RUNTIME_UNAVAILABLE", status: state.status };
    }
    const processing = await this.processing.claim(receipt.messageId, input.sessionFence, correlationId, now);
    if (processing.kind !== "CLAIMED") {
      const reason = processing.kind === "ACTIVE"
        ? "PROCESSING_ACTIVE"
        : processing.kind === "SUPPRESSED"
          ? "HUMAN_HANDOFF"
        : processing.kind === "FAILED"
          ? "PROCESSING_FAILED"
          : processing.kind === "UNKNOWN_RESULT"
            ? "UNKNOWN_RESULT"
            : "PROCESSING_ACTIVE";
      return { kind: "SUPPRESSED", conversationId: receipt.conversationId, messageId: receipt.messageId, reason, status: state.status };
    }
    try {
      const outcome = await this.orchestrator.run({
        version: KORAL_ORCHESTRATOR_CONTRACT_VERSION,
        normalizedMessageId: receipt.messageId,
        correlationId,
        deadlineAt,
        effectiveIdentity: resolved.identity,
      });
      await this.processing.complete(receipt.messageId, processing.leaseId, correlationId, "ORCHESTRATED");
      return { kind: "ORCHESTRATED", conversationId: receipt.conversationId, messageId: receipt.messageId, outcome };
    } catch (error) {
      await this.processing.markUnknown(receipt.messageId, processing.leaseId, correlationId);
      throw error;
    }
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
