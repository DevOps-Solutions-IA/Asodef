import { createHash, randomUUID } from "node:crypto";
import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import {
  AuditEventResult,
  ConversationMessageDirection,
  ConversationMessageStatus,
  ConversationParticipantKind,
  ConversationStatus,
  Prisma,
  UserStatus,
} from "@prisma/client";
import { PrismaService } from "../../database/prisma.service";
import { normalizeInboundMessage } from "./channel-normalization";
import { canTransitionConversation, mayKoralAutoReply, statusAfterInbound } from "./conversation-state-machine";
import type { InboundMessage } from "./contracts/channel.contract";
import type { AddInternalNoteDto } from "./dto/add-internal-note.dto";
import type { AssignConversationDto } from "./dto/assign-conversation.dto";
import type { EscalateConversationDto } from "./dto/escalate-conversation.dto";
import type { ListConversationsQueryDto } from "./dto/list-conversations-query.dto";
import type { ReleaseConversationDto } from "./dto/release-conversation.dto";
import type { ReturnToKoralDto } from "./dto/return-to-koral.dto";
import type { TransitionConversationDto } from "./dto/transition-conversation.dto";
import type { ConversationRuntimeState, ConversationSummaryResponse, InboundReceipt, KoralOutboundCommitInput, MutationContext } from "./koral-conversations.types";

const GENERIC_NOT_FOUND = "No se encontró la conversación solicitada.";
const CONCURRENT_CHANGE = "La conversación cambió mientras se procesaba la acción. Actualiza e intenta nuevamente.";
const IDEMPOTENCY_CONFLICT = "La clave de idempotencia ya fue utilizada con una operación diferente.";
const ACTIVE_ASSIGNMENT_CONFLICT = "La asignación humana activa impide esta transición.";

@Injectable()
export class KoralConversationsService {
  constructor(private readonly prisma: PrismaService) {}

  async receiveInbound(rawInput: InboundMessage): Promise<InboundReceipt> {
    const input = normalizeInboundMessage(rawInput);
    return this.prisma.$transaction(async (tx) => {
      const lockKey = `koral:${input.channel}:${input.externalSessionId}`;
      await tx.$queryRaw<Array<{ acquired: boolean }>>(
        Prisma.sql`SELECT true AS acquired FROM pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`,
      );

      let channelSession = await tx.conversationChannelSession.findUnique({
        where: { channel_externalSessionId: { channel: input.channel, externalSessionId: input.externalSessionId } },
        include: { conversation: true },
      });

      if (!channelSession) {
        const conversation = await tx.conversation.create({ data: { status: ConversationStatus.AI_ACTIVE, lastMessageAt: input.occurredAt } });
        channelSession = await tx.conversationChannelSession.create({
          data: {
            conversationId: conversation.id,
            channel: input.channel,
            externalSessionId: input.externalSessionId,
            adapterVersion: input.adapterVersion,
            channelMetadata: input.channelMetadata,
            lastSeenAt: input.occurredAt,
          },
          include: { conversation: true },
        });
      }

      await lockConversation(tx, channelSession.conversationId);
      channelSession = await tx.conversationChannelSession.findUniqueOrThrow({
        where: { id: channelSession.id },
        include: { conversation: true },
      });

      const duplicate = await tx.conversationMessage.findUnique({
        where: {
          channelSessionId_externalMessageId: {
            channelSessionId: channelSession.id,
            externalMessageId: input.externalMessageId,
          },
        },
      });
      if (duplicate) {
        return {
          conversationId: duplicate.conversationId,
          messageId: duplicate.id,
          duplicate: true,
          shouldAutoReply: false,
          status: channelSession.conversation.status,
        };
      }

      const participant = await tx.conversationParticipant.upsert({
        where: {
          conversationId_channel_externalIdentityId: {
            conversationId: channelSession.conversationId,
            channel: input.channel,
            externalIdentityId: input.identity.externalIdentityId,
          },
        },
        create: {
          conversationId: channelSession.conversationId,
          kind: ConversationParticipantKind.EXTERNAL,
          channel: input.channel,
          externalIdentityId: input.identity.externalIdentityId,
          displayName: input.identity.displayName,
        },
        update: input.identity.displayName ? { displayName: input.identity.displayName } : {},
      });

      const message = await tx.conversationMessage.create({
        data: {
          conversationId: channelSession.conversationId,
          channelSessionId: channelSession.id,
          participantId: participant.id,
          direction: ConversationMessageDirection.INBOUND,
          status: ConversationMessageStatus.RECEIVED,
          externalMessageId: input.externalMessageId,
          contentType: input.contentType,
          body: input.body,
          correlationId: input.correlationId,
          occurredAt: input.occurredAt,
          attachments: { create: input.attachments },
        },
      });

      const previousStatus = channelSession.conversation.status;
      const nextStatus = statusAfterInbound(previousStatus);
      const updated = await tx.conversation.update({
        where: { id: channelSession.conversationId },
        data: {
          status: nextStatus,
          lastMessageAt: input.occurredAt,
          resolvedAt: nextStatus === ConversationStatus.RESOLVED ? channelSession.conversation.resolvedAt : null,
          version: { increment: 1 },
        },
      });
      await tx.conversationChannelSession.update({ where: { id: channelSession.id }, data: { lastSeenAt: input.occurredAt } });
      await tx.conversationEvent.create({
        data: {
          conversationId: updated.id,
          eventType: "MESSAGE_RECEIVED",
          correlationId: input.correlationId,
          idempotencyKey: `inbound:${input.channel}:${input.externalSessionId}:${input.externalMessageId}`,
          previousStatus,
          newStatus: nextStatus,
          result: AuditEventResult.SUCCESS,
          metadata: { channel: input.channel, contentType: input.contentType, attachmentCount: input.attachments.length },
        },
      });

      const activeAssignment = await tx.conversationAssignment.findFirst({
        where: { conversationId: updated.id, releasedAt: null },
        select: { id: true },
      });

      return {
        conversationId: updated.id,
        messageId: message.id,
        duplicate: false,
        shouldAutoReply: mayKoralAutoReply(updated.status, Boolean(activeAssignment)),
        status: updated.status,
      };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
  }

  async list(query: ListConversationsQueryDto): Promise<{ items: ConversationSummaryResponse[]; total: number; page: number; pageSize: number }> {
    const where = query.status ? { status: query.status } : {};
    const [rows, total] = await Promise.all([
      this.prisma.conversation.findMany({
        where,
        orderBy: { updatedAt: "desc" },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: {
          assignments: { where: { releasedAt: null }, select: { assigneeUserId: true }, take: 1 },
          channelSessions: { select: { channel: true }, distinct: ["channel"] },
        },
      }),
      this.prisma.conversation.count({ where }),
    ]);
    return {
      items: rows.map((row) => ({
        id: row.id,
        status: row.status,
        priority: row.priority,
        version: row.version,
        subject: row.subject,
        lastMessageAt: row.lastMessageAt,
        slaDueAt: row.slaDueAt,
        activeAssigneeUserId: row.assignments[0]?.assigneeUserId ?? null,
        channels: row.channelSessions.map((session) => session.channel),
        updatedAt: row.updatedAt,
      })),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async findById(id: string) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id },
      include: {
        participants: true,
        messages: { orderBy: { occurredAt: "asc" }, include: { attachments: true } },
        assignments: { orderBy: { assignedAt: "desc" } },
        internalNotes: { orderBy: { createdAt: "asc" } },
        tags: true,
        events: { orderBy: { createdAt: "asc" } },
        identityBindings: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] },
        channelSessions: true,
      },
    });
    if (!conversation) throw new NotFoundException(GENERIC_NOT_FOUND);
    return conversation;
  }

  async getRuntimeState(id: string): Promise<ConversationRuntimeState> {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        version: true,
        assignments: { where: { releasedAt: null }, select: { id: true }, take: 1 },
      },
    });
    if (!conversation) throw new NotFoundException(GENERIC_NOT_FOUND);
    const hasActiveAssignment = conversation.assignments.length > 0;
    return {
      id: conversation.id,
      status: conversation.status,
      version: conversation.version,
      hasActiveAssignment,
      mayAutoReply: mayKoralAutoReply(conversation.status, hasActiveAssignment),
    };
  }

  /** Commits an AI response only if the exact conversation version remains
   * auto-replyable. A concurrent human takeover therefore wins and no AI
   * message is persisted or delivered while HUMAN_ACTIVE. */
  async commitKoralOutbound(input: KoralOutboundCommitInput) {
    const idempotencyKey = requiredRuntimeText(input.idempotencyKey, "INVALID_IDEMPOTENCY_KEY", 180);
    const correlationId = requiredRuntimeText(input.correlationId, "INVALID_CORRELATION_ID", 200);
    const contentType = requiredRuntimeText(input.contentType, "INVALID_CONTENT_TYPE", 128).toLowerCase();
    if (!input.body || input.body.length > 50_000) throw new BadRequestException("INVALID_OUTBOUND_BODY");
    const payloadHash = createHash("sha256").update(`${input.channel}\0${input.externalSessionId}\0${contentType}\0${input.body}`).digest("hex");
    return this.prisma.$transaction(async (tx) => {
      await lockConversation(tx, input.conversationId);
      const replay = await tx.conversationEvent.findUnique({
        where: { conversationId_idempotencyKey: { conversationId: input.conversationId, idempotencyKey: `outbound:${idempotencyKey}` } },
      });
      if (replay) {
        const metadata = jsonObject(replay.metadata);
        const messageId = typeof metadata.messageId === "string" ? metadata.messageId : null;
        if (
          !messageId
          || metadata.payloadHash !== payloadHash
          || metadata.channel !== input.channel
          || metadata.contentType !== contentType
        ) throw new ConflictException(IDEMPOTENCY_CONFLICT);
        return { committed: true as const, replayed: true as const, messageId };
      }
      const conversation = await tx.conversation.findUnique({
        where: { id: input.conversationId },
        include: { assignments: { where: { releasedAt: null }, select: { id: true }, take: 1 } },
      });
      if (!conversation) throw new NotFoundException(GENERIC_NOT_FOUND);
      if (
        conversation.version !== input.expectedVersion
        || !mayKoralAutoReply(conversation.status, conversation.assignments.length > 0)
      ) {
        return { committed: false as const, replayed: false as const, reason: "CONVERSATION_NOT_AI_ACTIVE" as const };
      }
      const channelSession = await tx.conversationChannelSession.findUnique({
        where: { channel_externalSessionId: { channel: input.channel, externalSessionId: input.externalSessionId } },
      });
      if (!channelSession || channelSession.conversationId !== input.conversationId) {
        throw new ConflictException("CHANNEL_SESSION_MISMATCH");
      }
      const message = await tx.conversationMessage.create({
        data: {
          conversationId: input.conversationId,
          channelSessionId: channelSession.id,
          direction: ConversationMessageDirection.OUTBOUND,
          status: ConversationMessageStatus.PENDING,
          externalMessageId: `koral:${idempotencyKey}`,
          contentType,
          body: input.body,
          correlationId,
          occurredAt: new Date(),
        },
      });
      await tx.conversation.update({
        where: { id: input.conversationId },
        data: { status: ConversationStatus.WAITING_USER, lastMessageAt: message.occurredAt, version: { increment: 1 } },
      });
      await tx.conversationEvent.create({
        data: {
          conversationId: input.conversationId,
          eventType: "KORAL_RESPONSE_QUEUED",
          correlationId,
          idempotencyKey: `outbound:${idempotencyKey}`,
          previousStatus: conversation.status,
          newStatus: ConversationStatus.WAITING_USER,
          result: AuditEventResult.SUCCESS,
          metadata: { messageId: message.id, channel: input.channel, contentType, payloadHash },
        },
      });
      return { committed: true as const, replayed: false as const, messageId: message.id };
    });
  }

  async assign(id: string, dto: AssignConversationDto, context: MutationContext) {
    const mutation = normalizeMutationContext(context);
    const reason = optionalReason(dto.reason);
    return this.prisma.$transaction(async (tx) => {
      await lockConversation(tx, id);
      const replay = await tx.conversationEvent.findUnique({
        where: { conversationId_idempotencyKey: { conversationId: id, idempotencyKey: dto.idempotencyKey } },
      });
      if (replay) {
        const metadata = jsonObject(replay.metadata);
        const isAssignment = [
          "ASSIGNMENT_CREATED",
          "ASSIGNMENT_RETAINED",
          "ASSIGNMENT_UPDATED",
          "ASSIGNMENT_TRANSFERRED",
          "ASSIGNMENT_TAKEN_OVER",
        ].includes(replay.eventType);
        if (
          !isAssignment
          || metadata.assigneeUserId !== dto.assigneeUserId
          || metadata.priority !== dto.priority
          || metadata.expectedVersion !== dto.expectedVersion
          || replay.reason !== (reason ?? null)
        ) {
          throw new ConflictException(IDEMPOTENCY_CONFLICT);
        }
        return this.findByIdWithClient(tx, id);
      }

      const [conversation, assignee] = await Promise.all([
        tx.conversation.findUnique({ where: { id } }),
        tx.user.findFirst({ where: { id: dto.assigneeUserId, status: UserStatus.ACTIVE }, select: { id: true } }),
      ]);
      if (!conversation) throw new NotFoundException(GENERIC_NOT_FOUND);
      if (!assignee) throw new BadRequestException("El responsable debe ser un usuario activo.");
      assertTransition(conversation.status, ConversationStatus.HUMAN_ACTIVE);

      const active = await tx.conversationAssignment.findFirst({ where: { conversationId: id, releasedAt: null } });
      if (conversation.version !== dto.expectedVersion) throw new ConflictException(CONCURRENT_CHANGE);

      const sameAssignee = active?.assigneeUserId === dto.assigneeUserId;
      const assignmentChanged = !sameAssignee || active?.priority !== dto.priority || conversation.status !== ConversationStatus.HUMAN_ACTIVE;
      const changed = await tx.conversation.updateMany({
        where: { id, version: dto.expectedVersion },
        data: {
          status: ConversationStatus.HUMAN_ACTIVE,
          priority: dto.priority,
          ...(assignmentChanged ? { version: { increment: 1 } } : {}),
        },
      });
      if (changed.count !== 1) throw new ConflictException(CONCURRENT_CHANGE);

      if (sameAssignee) {
        if (active.priority !== dto.priority) {
          await tx.conversationAssignment.update({ where: { id: active.id }, data: { priority: dto.priority } });
        }
      } else {
        if (active) await tx.conversationAssignment.update({ where: { id: active.id }, data: { releasedAt: new Date() } });
        await tx.conversationAssignment.create({
          data: {
            conversationId: id,
            assigneeUserId: dto.assigneeUserId,
            assignedByUserId: mutation.actorUserId,
            priority: dto.priority,
            reason,
          },
        });
      }
      await tx.conversationParticipant.upsert({
        where: { conversationId_userId: { conversationId: id, userId: dto.assigneeUserId } },
        create: { conversationId: id, kind: ConversationParticipantKind.HUMAN_AGENT, userId: dto.assigneeUserId },
        update: {},
      });
      const eventType = assignmentEventType(active?.assigneeUserId, dto.assigneeUserId, mutation.actorUserId, assignmentChanged);
      await tx.conversationEvent.create({
        data: {
          conversationId: id,
          eventType,
          actorUserId: mutation.actorUserId,
          requestId: mutation.requestId,
          correlationId: mutation.correlationId,
          idempotencyKey: dto.idempotencyKey,
          previousStatus: conversation.status,
          newStatus: ConversationStatus.HUMAN_ACTIVE,
          reason,
          metadata: {
            assigneeUserId: dto.assigneeUserId,
            priority: dto.priority,
            previousAssigneeUserId: active?.assigneeUserId ?? null,
            expectedVersion: dto.expectedVersion,
          },
        },
      });
      return this.findByIdWithClient(tx, id);
    });
  }

  async returnToKoral(id: string, dto: ReturnToKoralDto, context: MutationContext) {
    const mutation = normalizeMutationContext(context);
    const reason = optionalReason(dto.reason);
    return this.prisma.$transaction(async (tx) => {
      await lockConversation(tx, id);
      const replay = await tx.conversationEvent.findUnique({
        where: { conversationId_idempotencyKey: { conversationId: id, idempotencyKey: dto.idempotencyKey } },
      });
      if (replay) {
        const metadata = jsonObject(replay.metadata);
        if (
          replay.eventType !== "RETURNED_TO_KORAL"
          || replay.reason !== (reason ?? null)
          || metadata.expectedVersion !== dto.expectedVersion
        ) {
          throw new ConflictException(IDEMPOTENCY_CONFLICT);
        }
        return this.findByIdWithClient(tx, id);
      }
      const conversation = await tx.conversation.findUnique({ where: { id } });
      if (!conversation) throw new NotFoundException(GENERIC_NOT_FOUND);
      const active = await tx.conversationAssignment.findFirst({ where: { conversationId: id, releasedAt: null } });
      if (!active || active.assigneeUserId !== mutation.actorUserId) {
        throw new ForbiddenException("Solo el responsable activo puede devolver la conversación a Koral.");
      }
      assertTransition(conversation.status, ConversationStatus.AI_ACTIVE);
      const changed = await tx.conversation.updateMany({
        where: { id, version: dto.expectedVersion, status: ConversationStatus.HUMAN_ACTIVE },
        data: { status: ConversationStatus.AI_ACTIVE, version: { increment: 1 } },
      });
      if (changed.count !== 1) throw new ConflictException(CONCURRENT_CHANGE);
      await tx.conversationAssignment.update({ where: { id: active.id }, data: { releasedAt: new Date() } });
      await tx.conversationEvent.create({
        data: {
          conversationId: id,
          eventType: "RETURNED_TO_KORAL",
          actorUserId: mutation.actorUserId,
          requestId: mutation.requestId,
          correlationId: mutation.correlationId,
          idempotencyKey: dto.idempotencyKey,
          previousStatus: conversation.status,
          newStatus: ConversationStatus.AI_ACTIVE,
          reason,
          metadata: { expectedVersion: dto.expectedVersion, releasedAssignmentId: active.id },
        },
      });
      return this.findByIdWithClient(tx, id);
    });
  }

  async escalate(id: string, dto: EscalateConversationDto, context: MutationContext) {
    const mutation = normalizeMutationContext(context);
    const reason = requiredAuditText(dto.reason, "INVALID_REASON", 500);
    const reasonCode = safeReasonCode(dto.reasonCode);
    return this.prisma.$transaction(async (tx) => {
      await lockConversation(tx, id);
      const replay = await tx.conversationEvent.findUnique({
        where: { conversationId_idempotencyKey: { conversationId: id, idempotencyKey: dto.idempotencyKey } },
      });
      if (replay) {
        const metadata = jsonObject(replay.metadata);
        if (
          replay.eventType !== "CONVERSATION_ESCALATED"
          || replay.reason !== reason
          || metadata.reasonCode !== reasonCode
          || metadata.expectedVersion !== dto.expectedVersion
        ) throw new ConflictException(IDEMPOTENCY_CONFLICT);
        return this.findByIdWithClient(tx, id);
      }
      const conversation = await tx.conversation.findUnique({ where: { id } });
      if (!conversation) throw new NotFoundException(GENERIC_NOT_FOUND);
      const active = await tx.conversationAssignment.findFirst({ where: { conversationId: id, releasedAt: null }, select: { id: true } });
      if (active) throw new ConflictException(ACTIVE_ASSIGNMENT_CONFLICT);
      if (conversation.status === ConversationStatus.HUMAN_REQUIRED) throw new ConflictException("CONVERSATION_ALREADY_ESCALATED");
      assertTransition(conversation.status, ConversationStatus.HUMAN_REQUIRED);
      const changed = await tx.conversation.updateMany({
        where: { id, version: dto.expectedVersion },
        data: { status: ConversationStatus.HUMAN_REQUIRED, version: { increment: 1 } },
      });
      if (changed.count !== 1) throw new ConflictException(CONCURRENT_CHANGE);
      await tx.conversationEvent.create({
        data: {
          conversationId: id,
          eventType: "CONVERSATION_ESCALATED",
          actorUserId: mutation.actorUserId,
          requestId: mutation.requestId,
          correlationId: mutation.correlationId,
          idempotencyKey: dto.idempotencyKey,
          previousStatus: conversation.status,
          newStatus: ConversationStatus.HUMAN_REQUIRED,
          reason,
          metadata: { reasonCode, escalationKind: "HUMAN_REQUIRED", expectedVersion: dto.expectedVersion },
        },
      });
      return this.findByIdWithClient(tx, id);
    });
  }

  async release(id: string, dto: ReleaseConversationDto, context: MutationContext) {
    const mutation = normalizeMutationContext(context);
    const reason = requiredAuditText(dto.reason, "INVALID_REASON", 500);
    return this.prisma.$transaction(async (tx) => {
      await lockConversation(tx, id);
      const replay = await tx.conversationEvent.findUnique({
        where: { conversationId_idempotencyKey: { conversationId: id, idempotencyKey: dto.idempotencyKey } },
      });
      if (replay) {
        const metadata = jsonObject(replay.metadata);
        if (
          replay.eventType !== "ASSIGNMENT_RELEASED"
          || replay.reason !== reason
          || metadata.expectedVersion !== dto.expectedVersion
        ) throw new ConflictException(IDEMPOTENCY_CONFLICT);
        return this.findByIdWithClient(tx, id);
      }
      const conversation = await tx.conversation.findUnique({ where: { id } });
      if (!conversation) throw new NotFoundException(GENERIC_NOT_FOUND);
      const active = await tx.conversationAssignment.findFirst({ where: { conversationId: id, releasedAt: null } });
      if (!active || active.assigneeUserId !== mutation.actorUserId) {
        throw new ForbiddenException("Solo el responsable activo puede liberar la conversación.");
      }
      assertTransition(conversation.status, ConversationStatus.HUMAN_REQUIRED);
      const changed = await tx.conversation.updateMany({
        where: { id, version: dto.expectedVersion },
        data: { status: ConversationStatus.HUMAN_REQUIRED, version: { increment: 1 } },
      });
      if (changed.count !== 1) throw new ConflictException(CONCURRENT_CHANGE);
      await tx.conversationAssignment.update({ where: { id: active.id }, data: { releasedAt: new Date() } });
      await tx.conversationEvent.create({
        data: {
          conversationId: id,
          eventType: "ASSIGNMENT_RELEASED",
          actorUserId: mutation.actorUserId,
          requestId: mutation.requestId,
          correlationId: mutation.correlationId,
          idempotencyKey: dto.idempotencyKey,
          previousStatus: conversation.status,
          newStatus: ConversationStatus.HUMAN_REQUIRED,
          reason,
          metadata: { expectedVersion: dto.expectedVersion, releasedAssignmentId: active.id },
        },
      });
      return this.findByIdWithClient(tx, id);
    });
  }

  async transitionStatus(id: string, dto: TransitionConversationDto, context: MutationContext) {
    const mutation = normalizeMutationContext(context);
    const reason = requiredAuditText(dto.reason, "INVALID_REASON", 500);
    const target = dto.targetStatus;
    const eventType = operatorTransitionEvent(target);
    return this.prisma.$transaction(async (tx) => {
      await lockConversation(tx, id);
      const replay = await tx.conversationEvent.findUnique({
        where: { conversationId_idempotencyKey: { conversationId: id, idempotencyKey: dto.idempotencyKey } },
      });
      if (replay) {
        const metadata = jsonObject(replay.metadata);
        if (
          replay.eventType !== eventType
          || replay.reason !== reason
          || metadata.targetStatus !== target
          || metadata.expectedVersion !== dto.expectedVersion
        ) throw new ConflictException(IDEMPOTENCY_CONFLICT);
        return this.findByIdWithClient(tx, id);
      }
      const conversation = await tx.conversation.findUnique({ where: { id } });
      if (!conversation) throw new NotFoundException(GENERIC_NOT_FOUND);
      if (conversation.status === target) throw new ConflictException("CONVERSATION_STATUS_UNCHANGED");
      assertTransition(conversation.status, target);
      const active = await tx.conversationAssignment.findFirst({ where: { conversationId: id, releasedAt: null } });
      assertOperatorTransitionOwnership(conversation.status, target, active?.assigneeUserId, mutation.actorUserId);
      const now = new Date();
      const changed = await tx.conversation.updateMany({
        where: { id, version: dto.expectedVersion },
        data: {
          status: target,
          version: { increment: 1 },
          ...(target === ConversationStatus.RESOLVED ? { resolvedAt: now, closedAt: null } : {}),
          ...(target === ConversationStatus.CLOSED ? { closedAt: now } : {}),
          ...(target === ConversationStatus.AI_ACTIVE ? { resolvedAt: null, closedAt: null } : {}),
        },
      });
      if (changed.count !== 1) throw new ConflictException(CONCURRENT_CHANGE);
      if (active && (target === ConversationStatus.RESOLVED || target === ConversationStatus.CLOSED)) {
        await tx.conversationAssignment.update({ where: { id: active.id }, data: { releasedAt: now } });
      }
      await tx.conversationEvent.create({
        data: {
          conversationId: id,
          eventType,
          actorUserId: mutation.actorUserId,
          requestId: mutation.requestId,
          correlationId: mutation.correlationId,
          idempotencyKey: dto.idempotencyKey,
          previousStatus: conversation.status,
          newStatus: target,
          reason,
          metadata: {
            targetStatus: target,
            expectedVersion: dto.expectedVersion,
            releasedAssignmentId: active && (target === ConversationStatus.RESOLVED || target === ConversationStatus.CLOSED) ? active.id : null,
          },
        },
      });
      return this.findByIdWithClient(tx, id);
    });
  }

  async addInternalNote(id: string, dto: AddInternalNoteDto, context: MutationContext) {
    const mutation = normalizeMutationContext(context);
    return this.prisma.$transaction(async (tx) => {
      await lockConversation(tx, id);
      const conversation = await tx.conversation.findUnique({ where: { id }, select: { id: true, status: true } });
      if (!conversation) throw new NotFoundException(GENERIC_NOT_FOUND);
      const replay = await tx.conversationEvent.findUnique({
        where: { conversationId_idempotencyKey: { conversationId: id, idempotencyKey: dto.idempotencyKey } },
      });
      if (replay) {
        if (replay.eventType !== "INTERNAL_NOTE_ADDED") throw new ConflictException(IDEMPOTENCY_CONFLICT);
        const note = await tx.conversationInternalNote.findUniqueOrThrow({
          where: { conversationId_idempotencyKey: { conversationId: id, idempotencyKey: dto.idempotencyKey } },
        });
        if (note.body !== dto.body.trim()) throw new ConflictException(IDEMPOTENCY_CONFLICT);
        return note;
      }
      const note = await tx.conversationInternalNote.create({
        data: { conversationId: id, authorUserId: mutation.actorUserId, idempotencyKey: dto.idempotencyKey, body: dto.body.trim() },
      });
      await tx.conversationEvent.create({
        data: {
          conversationId: id,
          eventType: "INTERNAL_NOTE_ADDED",
          actorUserId: mutation.actorUserId,
          requestId: mutation.requestId,
          correlationId: mutation.correlationId,
          idempotencyKey: dto.idempotencyKey,
          previousStatus: conversation.status,
          newStatus: conversation.status,
          metadata: { noteId: note.id },
        },
      });
      return note;
    });
  }

  private async findByIdWithClient(tx: Prisma.TransactionClient, id: string) {
    return tx.conversation.findUniqueOrThrow({
      where: { id },
      include: { assignments: { orderBy: { assignedAt: "desc" } }, events: { orderBy: { createdAt: "asc" } } },
    });
  }
}

function jsonObject(value: Prisma.JsonValue | null): Prisma.JsonObject {
  if (value === null || Array.isArray(value) || typeof value !== "object") return {};
  return value;
}

function requiredRuntimeText(value: string, code: string, maxLength: number): string {
  const normalized = value.trim();
  const hasControlCharacter = [...normalized].some((character) => {
    const codePoint = character.charCodeAt(0);
    return codePoint < 32 || codePoint === 127;
  });
  if (!normalized || normalized.length > maxLength || hasControlCharacter) throw new BadRequestException(code);
  return normalized;
}

async function lockConversation(tx: Prisma.TransactionClient, conversationId: string): Promise<void> {
  await tx.$queryRaw<Array<{ acquired: boolean }>>(
    Prisma.sql`SELECT true AS acquired FROM pg_advisory_xact_lock(hashtextextended(${`koral-conversation:${conversationId}`}, 0))`,
  );
}

function assertTransition(from: ConversationStatus, to: ConversationStatus): void {
  if (!canTransitionConversation(from, to)) {
    throw new ConflictException(`INVALID_CONVERSATION_TRANSITION:${from}:${to}`);
  }
}

function assignmentEventType(
  previousAssigneeUserId: string | undefined,
  assigneeUserId: string,
  actorUserId: string,
  assignmentChanged: boolean,
): string {
  if (!previousAssigneeUserId) return "ASSIGNMENT_CREATED";
  if (previousAssigneeUserId === assigneeUserId) return assignmentChanged ? "ASSIGNMENT_UPDATED" : "ASSIGNMENT_RETAINED";
  return assigneeUserId === actorUserId ? "ASSIGNMENT_TAKEN_OVER" : "ASSIGNMENT_TRANSFERRED";
}

function assertOperatorTransitionOwnership(
  current: ConversationStatus,
  target: ConversationStatus,
  activeAssigneeUserId: string | undefined,
  actorUserId: string,
): void {
  if (target === ConversationStatus.AI_ACTIVE) {
    if (current !== ConversationStatus.RESOLVED || activeAssigneeUserId) {
      throw new ConflictException("REOPEN_REQUIRES_RESOLVED_UNASSIGNED_CONVERSATION");
    }
    return;
  }
  if (target === ConversationStatus.WAITING_INTERNAL) {
    if (current !== ConversationStatus.HUMAN_ACTIVE || activeAssigneeUserId !== actorUserId) {
      throw new ForbiddenException("Solo el responsable activo puede dejar la conversación en espera interna.");
    }
    return;
  }
  if (activeAssigneeUserId && activeAssigneeUserId !== actorUserId) {
    throw new ForbiddenException("Solo el responsable activo puede finalizar una conversación asignada.");
  }
}

function operatorTransitionEvent(target: ConversationStatus): string {
  switch (target) {
    case ConversationStatus.AI_ACTIVE:
      return "CONVERSATION_REOPENED";
    case ConversationStatus.WAITING_INTERNAL:
      return "CONVERSATION_WAITING_INTERNAL";
    case ConversationStatus.RESOLVED:
      return "CONVERSATION_RESOLVED";
    case ConversationStatus.CLOSED:
      return "CONVERSATION_CLOSED";
    default:
      throw new BadRequestException("UNSUPPORTED_OPERATOR_TRANSITION");
  }
}

function normalizeMutationContext(context: MutationContext): Required<Pick<MutationContext, "actorUserId" | "correlationId">> & Pick<MutationContext, "requestId"> {
  return {
    actorUserId: requiredAuditText(context.actorUserId, "INVALID_ACTOR_ID", 200),
    requestId: context.requestId ? requiredAuditText(context.requestId, "INVALID_REQUEST_ID", 200) : undefined,
    correlationId: context.correlationId
      ? requiredAuditText(context.correlationId, "INVALID_CORRELATION_ID", 200)
      : context.requestId
        ? requiredAuditText(context.requestId, "INVALID_REQUEST_ID", 200)
        : randomUUID(),
  };
}

function optionalReason(value?: string): string | undefined {
  return value === undefined ? undefined : requiredAuditText(value, "INVALID_REASON", 500);
}

function requiredAuditText(value: string, code: string, maxLength: number): string {
  return requiredRuntimeText(value, code, maxLength);
}

function safeReasonCode(value: string): string {
  const normalized = requiredAuditText(value, "INVALID_REASON_CODE", 100);
  if (!/^[A-Z][A-Z0-9_]{2,99}$/.test(normalized)) throw new BadRequestException("INVALID_REASON_CODE");
  return normalized;
}
