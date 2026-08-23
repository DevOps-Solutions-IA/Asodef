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
import { mayKoralAutoReply, statusAfterInbound } from "./conversation-state-machine";
import type { InboundMessage } from "./contracts/channel.contract";
import type { AddInternalNoteDto } from "./dto/add-internal-note.dto";
import type { AssignConversationDto } from "./dto/assign-conversation.dto";
import type { ListConversationsQueryDto } from "./dto/list-conversations-query.dto";
import type { ReturnToKoralDto } from "./dto/return-to-koral.dto";
import type { ConversationSummaryResponse, InboundReceipt, MutationContext } from "./koral-conversations.types";

const GENERIC_NOT_FOUND = "No se encontró la conversación solicitada.";
const CONCURRENT_CHANGE = "La conversación cambió mientras se procesaba la acción. Actualiza e intenta nuevamente.";
const IDEMPOTENCY_CONFLICT = "La clave de idempotencia ya fue utilizada con una operación diferente.";

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

      return {
        conversationId: updated.id,
        messageId: message.id,
        duplicate: false,
        shouldAutoReply: mayKoralAutoReply(updated.status),
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
        channelSessions: true,
      },
    });
    if (!conversation) throw new NotFoundException(GENERIC_NOT_FOUND);
    return conversation;
  }

  async assign(id: string, dto: AssignConversationDto, context: MutationContext) {
    return this.prisma.$transaction(async (tx) => {
      const replay = await tx.conversationEvent.findUnique({
        where: { conversationId_idempotencyKey: { conversationId: id, idempotencyKey: dto.idempotencyKey } },
      });
      if (replay) {
        const metadata = jsonObject(replay.metadata);
        const isAssignment = replay.eventType === "ASSIGNMENT_CREATED" || replay.eventType === "ASSIGNMENT_TAKEN_OVER";
        if (
          !isAssignment
          || metadata.assigneeUserId !== dto.assigneeUserId
          || metadata.priority !== dto.priority
          || replay.reason !== (dto.reason ?? null)
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
      if (conversation.status === ConversationStatus.CLOSED) throw new ConflictException("Una conversación cerrada no puede ser asignada.");

      const active = await tx.conversationAssignment.findFirst({ where: { conversationId: id, releasedAt: null } });
      const changed = await tx.conversation.updateMany({
        where: { id, version: dto.expectedVersion },
        data: { status: ConversationStatus.HUMAN_ACTIVE, priority: dto.priority, version: { increment: 1 } },
      });
      if (changed.count !== 1) throw new ConflictException(CONCURRENT_CHANGE);

      if (active) await tx.conversationAssignment.update({ where: { id: active.id }, data: { releasedAt: new Date() } });
      await tx.conversationAssignment.create({
        data: {
          conversationId: id,
          assigneeUserId: dto.assigneeUserId,
          assignedByUserId: context.actorUserId,
          priority: dto.priority,
          reason: dto.reason,
        },
      });
      await tx.conversationParticipant.upsert({
        where: { conversationId_userId: { conversationId: id, userId: dto.assigneeUserId } },
        create: { conversationId: id, kind: ConversationParticipantKind.HUMAN_AGENT, userId: dto.assigneeUserId },
        update: {},
      });
      await tx.conversationEvent.create({
        data: {
          conversationId: id,
          eventType: active ? "ASSIGNMENT_TAKEN_OVER" : "ASSIGNMENT_CREATED",
          actorUserId: context.actorUserId,
          requestId: context.requestId,
          correlationId: context.correlationId,
          idempotencyKey: dto.idempotencyKey,
          previousStatus: conversation.status,
          newStatus: ConversationStatus.HUMAN_ACTIVE,
          reason: dto.reason,
          metadata: { assigneeUserId: dto.assigneeUserId, priority: dto.priority, previousAssigneeUserId: active?.assigneeUserId ?? null },
        },
      });
      return this.findByIdWithClient(tx, id);
    });
  }

  async returnToKoral(id: string, dto: ReturnToKoralDto, context: MutationContext) {
    return this.prisma.$transaction(async (tx) => {
      const replay = await tx.conversationEvent.findUnique({
        where: { conversationId_idempotencyKey: { conversationId: id, idempotencyKey: dto.idempotencyKey } },
      });
      if (replay) {
        if (replay.eventType !== "RETURNED_TO_KORAL" || replay.reason !== (dto.reason ?? null)) {
          throw new ConflictException(IDEMPOTENCY_CONFLICT);
        }
        return this.findByIdWithClient(tx, id);
      }
      const conversation = await tx.conversation.findUnique({ where: { id } });
      if (!conversation) throw new NotFoundException(GENERIC_NOT_FOUND);
      const active = await tx.conversationAssignment.findFirst({ where: { conversationId: id, releasedAt: null } });
      if (!active || active.assigneeUserId !== context.actorUserId) {
        throw new ForbiddenException("Solo el responsable activo puede devolver la conversación a Koral.");
      }
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
          actorUserId: context.actorUserId,
          requestId: context.requestId,
          correlationId: context.correlationId,
          idempotencyKey: dto.idempotencyKey,
          previousStatus: conversation.status,
          newStatus: ConversationStatus.AI_ACTIVE,
          reason: dto.reason,
        },
      });
      return this.findByIdWithClient(tx, id);
    });
  }

  async addInternalNote(id: string, dto: AddInternalNoteDto, context: MutationContext) {
    return this.prisma.$transaction(async (tx) => {
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
        data: { conversationId: id, authorUserId: context.actorUserId, idempotencyKey: dto.idempotencyKey, body: dto.body.trim() },
      });
      await tx.conversationEvent.create({
        data: {
          conversationId: id,
          eventType: "INTERNAL_NOTE_ADDED",
          actorUserId: context.actorUserId,
          requestId: context.requestId,
          correlationId: context.correlationId,
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
