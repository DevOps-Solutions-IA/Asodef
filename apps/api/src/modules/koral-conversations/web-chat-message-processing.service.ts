import { randomUUID } from "node:crypto";
import { ConflictException, Injectable } from "@nestjs/common";
import { AuditEventResult, Prisma, WebChatProcessingStatus } from "@prisma/client";
import { PrismaService } from "../../database/prisma.service";
import { mayKoralAutoReply } from "./conversation-state-machine";
import { assertWebChatSessionFence, type WebChatSessionFence } from "./web-chat-session-lock";

const LEASE_MS = 30_000;

export type ProcessingClaim =
  | { kind: "CLAIMED"; leaseId: string }
  | { kind: "ACTIVE" }
  | { kind: "SUPPRESSED" }
  | { kind: "COMPLETED" | "SUPPRESSED" | "FAILED" | "UNKNOWN_RESULT" };

@Injectable()
export class WebChatMessageProcessingService {
  constructor(private readonly prisma: PrismaService) {}

  async claim(messageId: string, fence: WebChatSessionFence, correlationId: string, now = new Date()): Promise<ProcessingClaim> {
    return this.prisma.$transaction(async (tx) => {
      const initial = await tx.webChatMessageProcessing.findUnique({
        where: { messageId },
        include: { message: { select: { conversationId: true } } },
      });
      if (!initial) throw new ConflictException("WEB_CHAT_PROCESSING_OWNERSHIP_MISMATCH");
      await tx.$queryRaw<Array<{ acquired: boolean }>>(
        Prisma.sql`SELECT true AS acquired FROM pg_advisory_xact_lock(hashtextextended(${`koral-conversation:${initial.message.conversationId}`}, 0))`,
      );
      await assertWebChatSessionFence(tx, fence, now);
      const processing = await tx.webChatMessageProcessing.findUnique({
        where: { messageId },
        include: { message: { select: { conversationId: true } } },
      });
      if (!processing || processing.webChatSessionId !== fence.sessionId || processing.channelSessionId !== fence.channelSessionId) {
        throw new ConflictException("WEB_CHAT_PROCESSING_OWNERSHIP_MISMATCH");
      }
      const conversation = await tx.conversation.findUnique({
        where: { id: processing.message.conversationId },
        include: { assignments: { where: { releasedAt: null }, select: { id: true }, take: 1 } },
      });
      if (!conversation) throw new ConflictException("WEB_CHAT_PROCESSING_CONVERSATION_MISSING");
      if (!mayKoralAutoReply(conversation.status, conversation.assignments.length > 0)) {
        if (processing.status === WebChatProcessingStatus.PENDING) {
          const outcomeClass = conversation.assignments.length > 0 ? "ACTIVE_ASSIGNMENT" : "HUMAN_HANDOFF";
          await tx.webChatMessageProcessing.update({
            where: { id: processing.id },
            data: { status: WebChatProcessingStatus.SUPPRESSED, completedAt: now, outcomeClass },
          });
          await appendProcessingEvent(tx, processing.message.conversationId, messageId, correlationId, "WEB_CHAT_PROCESSING_SUPPRESSED", outcomeClass);
        }
        return { kind: "SUPPRESSED" as const };
      }
      if (processing.status === WebChatProcessingStatus.PROCESSING) {
        if (processing.leaseExpiresAt && processing.leaseExpiresAt > now) return { kind: "ACTIVE" as const };
        await tx.webChatMessageProcessing.update({
          where: { id: processing.id },
          data: {
            status: WebChatProcessingStatus.UNKNOWN_RESULT,
            leaseId: null,
            leaseExpiresAt: null,
            completedAt: now,
            outcomeClass: "LEASE_EXPIRED",
          },
        });
        await appendProcessingEvent(tx, processing.message.conversationId, messageId, correlationId, "WEB_CHAT_PROCESSING_UNKNOWN", "LEASE_EXPIRED");
        return { kind: "UNKNOWN_RESULT" as const };
      }
      if (processing.status !== WebChatProcessingStatus.PENDING) return { kind: processing.status } as ProcessingClaim;
      const leaseId = randomUUID();
      await tx.webChatMessageProcessing.update({
        where: { id: processing.id },
        data: {
          status: WebChatProcessingStatus.PROCESSING,
          leaseId,
          leaseExpiresAt: new Date(now.getTime() + LEASE_MS),
          attemptCount: { increment: 1 },
        },
      });
      return { kind: "CLAIMED" as const, leaseId };
    });
  }

  async complete(messageId: string, leaseId: string, correlationId: string, outcomeClass: "ORCHESTRATED", now = new Date()): Promise<void> {
    await this.finish(messageId, leaseId, correlationId, WebChatProcessingStatus.COMPLETED, outcomeClass, now);
  }

  async suppress(messageId: string, fence: WebChatSessionFence, correlationId: string, outcomeClass: "HUMAN_HANDOFF" | "ACTIVE_ASSIGNMENT", now = new Date()): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await assertWebChatSessionFence(tx, fence, now);
      const processing = await tx.webChatMessageProcessing.findUnique({ where: { messageId }, include: { message: { select: { conversationId: true } } } });
      if (!processing || processing.webChatSessionId !== fence.sessionId || processing.channelSessionId !== fence.channelSessionId) {
        throw new ConflictException("WEB_CHAT_PROCESSING_OWNERSHIP_MISMATCH");
      }
      if (processing.status === WebChatProcessingStatus.SUPPRESSED) return;
      // An already claimed/terminal invocation is never rewritten: it may
      // have crossed an external side-effect boundary. The caller still
      // suppresses any new invocation while human ownership is active.
      if (processing.status !== WebChatProcessingStatus.PENDING) return;
      await tx.webChatMessageProcessing.update({
        where: { id: processing.id },
        data: { status: WebChatProcessingStatus.SUPPRESSED, completedAt: now, outcomeClass },
      });
      await appendProcessingEvent(tx, processing.message.conversationId, messageId, correlationId, "WEB_CHAT_PROCESSING_SUPPRESSED", outcomeClass);
    });
  }

  async markUnknown(messageId: string, leaseId: string, correlationId: string, now = new Date()): Promise<void> {
    await this.finish(messageId, leaseId, correlationId, WebChatProcessingStatus.UNKNOWN_RESULT, "INVOCATION_RESULT_UNKNOWN", now);
  }

  private async finish(
    messageId: string,
    leaseId: string,
    correlationId: string,
    status: "COMPLETED" | "UNKNOWN_RESULT",
    outcomeClass: "ORCHESTRATED" | "INVOCATION_RESULT_UNKNOWN",
    now: Date,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const processing = await tx.webChatMessageProcessing.findUnique({ where: { messageId }, include: { message: { select: { conversationId: true } } } });
      if (!processing || processing.status !== WebChatProcessingStatus.PROCESSING || processing.leaseId !== leaseId) {
        throw new ConflictException("WEB_CHAT_PROCESSING_LEASE_CONFLICT");
      }
      await tx.webChatMessageProcessing.update({
        where: { id: processing.id },
        data: { status, leaseId: null, leaseExpiresAt: null, completedAt: now, outcomeClass },
      });
      await appendProcessingEvent(
        tx,
        processing.message.conversationId,
        messageId,
        correlationId,
        status === WebChatProcessingStatus.COMPLETED ? "WEB_CHAT_PROCESSING_COMPLETED" : "WEB_CHAT_PROCESSING_UNKNOWN",
        outcomeClass,
      );
    });
  }
}

async function appendProcessingEvent(
  tx: Prisma.TransactionClient,
  conversationId: string,
  messageId: string,
  correlationId: string,
  eventType: string,
  outcomeClass: string,
): Promise<void> {
  await tx.conversationEvent.create({
    data: {
      conversationId,
      eventType,
      correlationId,
      idempotencyKey: `web-processing:${messageId}:${eventType}`,
      result: AuditEventResult.SUCCESS,
      metadata: { messageId, outcomeClass },
    },
  });
}
