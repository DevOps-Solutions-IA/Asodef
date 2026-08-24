import { createHash } from "node:crypto";
import { ConflictException, HttpException, HttpStatus, Injectable, ServiceUnavailableException } from "@nestjs/common";
import { ConversationChannel, ConversationIdentityAssurance, ConversationMessageDirection, ConversationParticipantKind, Prisma } from "@prisma/client";
import { PrismaService } from "../../database/prisma.service";
import { RateLimitDependencyUnavailableError, RateLimiterService } from "../auth/rate-limiter.service";
import { KORAL_CHANNEL_CONTRACT_VERSION } from "./contracts/channel.contract";
import { WEB_CHAT_CONTRACT_VERSION, type PublicWebChatMessage, type PublicWebChatSnapshot } from "./contracts/web-chat.contract";
import { ConversationIdentityBindingService } from "./conversation-identity-binding.service";
import type { ClaimWebChatIdentityDto } from "./dto/claim-web-chat-identity.dto";
import type { SendWebChatMessageDto } from "./dto/send-web-chat-message.dto";
import { KoralIdentityResolutionService } from "./identity-resolution.service";
import { KoralConversationsService } from "./koral-conversations.service";
import { WebChatCryptoService } from "./web-chat-crypto.service";
import { KoralWebChatRuntimeAdapter } from "./web-chat-runtime.adapter";
import { WebChatSessionService, type ActiveWebChatSession } from "./web-chat-session.service";
import { assertWebChatSessionFence, type WebChatSessionFence } from "./web-chat-session-lock";

const PAGE_SIZE = 50;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

@Injectable()
export class WebChatServerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: WebChatSessionService,
    private readonly crypto: WebChatCryptoService,
    private readonly limiter: RateLimiterService,
    private readonly identities: KoralIdentityResolutionService,
    private readonly bindings: ConversationIdentityBindingService,
    private readonly conversations: KoralConversationsService,
    private readonly runtime: KoralWebChatRuntimeAdapter,
  ) {}

  async bootstrap(rawToken: string | undefined, ipAddress: string, correlationId: string) {
    await this.enforceRateLimit("bootstrap", ipAddress, 12, 60);
    const result = await this.sessions.bootstrap(rawToken, correlationId, async (tx, session) => {
      const resolved = this.identities.resolveAnonymous({
        channel: ConversationChannel.WEB,
        externalIdentityId: session.identityId,
      });
      await this.bindings.bindInTransaction(tx, {
        conversationId: session.channelSession.conversationId,
        identity: resolved.identity,
        reason: resolved.reason,
        evidenceReference: `web-session:${session.id}`,
        correlationId,
        idempotencyKey: `web-bootstrap:${session.id}`,
      }, true);
      return this.snapshot(session, undefined, tx);
    });
    return {
      ...result,
      snapshot: result.hookResult,
      cookieMaxAgeMs: Math.max(0, result.session.absoluteExpiresAt.getTime() - Date.now()),
    };
  }

  async history(rawToken: string, cursor: string | undefined, ipAddress: string) {
    const session = await this.sessions.authenticate(rawToken);
    await this.enforceRateLimit("history-ip", ipAddress, 240, 60);
    await this.enforceRateLimit("history", session.id, 120, 60);
    return this.snapshot(session, cursor);
  }

  async send(rawToken: string, dto: SendWebChatMessageDto, correlationId: string, ipAddress: string) {
    const session = await this.sessions.authenticate(rawToken);
    await this.enforceRateLimit("message-ip", ipAddress, 60, 60);
    const body = normalizeBody(dto.content.body);
    const replay = await this.findClientMessage(session, dto.clientMessageId);
    if (replay) {
      assertMessageMatches(replay, body);
    }
    const now = new Date();
    const runtimeResult = await this.runtime.receive({
      sessionFence: sessionFence(session),
      payloadHash: createHash("sha256").update(`text/plain\0${body}`).digest("hex"),
      message: {
        version: KORAL_CHANNEL_CONTRACT_VERSION,
        channel: ConversationChannel.WEB,
        adapterVersion: "web-server-v1",
        externalSessionId: session.channelSession.externalSessionId,
        externalMessageId: dto.clientMessageId,
        identity: {
          channel: ConversationChannel.WEB,
          externalIdentityId: session.identityId,
          displayName: session.claimedDisplayName ?? undefined,
        },
        occurredAt: now,
        contentType: "text/plain",
        body,
        attachments: [],
        correlationId,
      },
      ...(session.assuranceLevel === ConversationIdentityAssurance.CLAIMED
        ? { claimed: { identityId: `claimed:${session.identityId}`, evidenceReference: `web-claim:${session.id}` } }
        : {}),
      deadlineAt: new Date(now.getTime() + 10_000).toISOString(),
    }, now);
    if (runtimeResult.kind === "DUPLICATE") {
      const persisted = await this.findClientMessage(session, dto.clientMessageId);
      if (!persisted) throw webChatConflict("WEB_CHAT_DUPLICATE_STATE_INVALID", "No fue posible confirmar el mensaje.");
      assertMessageMatches(persisted, body);
    }
    return this.snapshot(await this.sessions.authenticate(rawToken));
  }

  async claim(rawToken: string, dto: ClaimWebChatIdentityDto, correlationId: string, ipAddress: string) {
    const session = await this.sessions.authenticate(rawToken);
    await this.enforceRateLimit("claim-ip", ipAddress, 20, 3_600);
    await this.enforceRateLimit("claim", session.id, 5, 3_600);
    const displayName = normalizeDisplayName(dto.displayName);
    const resolved = this.identities.resolveClaimed({
      channel: ConversationChannel.WEB,
      externalIdentityId: session.identityId,
      claimedIdentityId: `claimed:${session.identityId}`,
      evidenceReference: `web-claim:${session.id}`,
    });
    await this.prisma.$transaction(async (tx) => {
      const claimNow = new Date();
      const current = await assertWebChatSessionFence(tx, sessionFence(session), claimNow);
      if (current.assuranceLevel === ConversationIdentityAssurance.CLAIMED && current.claimedDisplayName !== displayName) {
        throw webChatConflict("WEB_CHAT_IDENTITY_ALREADY_CLAIMED", "La identidad declarada no coincide con la sesión actual.");
      }
      if (
        current.assuranceLevel !== ConversationIdentityAssurance.ANONYMOUS
        && current.assuranceLevel !== ConversationIdentityAssurance.CLAIMED
      ) {
        throw webChatConflict("WEB_CHAT_ASSURANCE_UPGRADE_NOT_ALLOWED", "La transición de identidad no está permitida.");
      }
      await this.bindings.bindInTransaction(tx, {
        conversationId: session.channelSession.conversationId,
        identity: resolved.identity,
        reason: resolved.reason,
        evidenceReference: resolved.evidenceReference,
        correlationId,
        idempotencyKey: `web-claim:${dto.clientClaimId}`,
      });
      if (current.assuranceLevel === ConversationIdentityAssurance.ANONYMOUS) {
        await tx.webChatSession.update({
          where: { id: current.id },
          data: { assuranceLevel: ConversationIdentityAssurance.CLAIMED, claimedDisplayName: displayName },
        });
      }
      await tx.conversationParticipant.updateMany({
        where: {
          conversationId: session.channelSession.conversationId,
          channel: ConversationChannel.WEB,
          externalIdentityId: session.identityId,
          kind: ConversationParticipantKind.EXTERNAL,
        },
        data: { displayName },
      });
    });
    return this.snapshot(await this.sessions.authenticate(rawToken));
  }

  private async snapshot(
    session: ActiveWebChatSession,
    cursorValue?: string,
    client: SnapshotClient = this.prisma,
  ): Promise<PublicWebChatSnapshot> {
    const cursor = cursorValue ? this.crypto.decodeCursor(cursorValue, session.id) : null;
    const cursorWhere: Prisma.ConversationMessageWhereInput | undefined = cursor
      ? {
          OR: [
            { occurredAt: { lt: new Date(cursor.occurredAt) } },
            { occurredAt: new Date(cursor.occurredAt), id: { lt: cursor.messageId } },
          ],
        }
      : undefined;
    const rows = await client.conversationMessage.findMany({
      where: {
        channelSessionId: session.channelSessionId,
        direction: { in: [ConversationMessageDirection.INBOUND, ConversationMessageDirection.OUTBOUND] },
        ...(cursorWhere ? { AND: [cursorWhere] } : {}),
      },
      include: { participant: { select: { kind: true } } },
      orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
      take: PAGE_SIZE + 1,
    });
    const hasMore = rows.length > PAGE_SIZE;
    const selected = rows.slice(0, PAGE_SIZE).reverse();
    const [state, conversation] = await Promise.all([
      this.conversations.getRuntimeStateWithClient(client, session.channelSession.conversationId),
      client.conversation.findUniqueOrThrow({ where: { id: session.channelSession.conversationId }, select: { updatedAt: true } }),
    ]);
    const messages: PublicWebChatMessage[] = selected.flatMap((message) => {
      if (!message.body) return [];
      return [{
        id: this.crypto.publicMessageId(session.id, message.id),
        ...(message.direction === ConversationMessageDirection.INBOUND && message.externalMessageId && UUID_PATTERN.test(message.externalMessageId)
          ? { clientMessageId: message.externalMessageId }
          : {}),
        direction: message.direction as "INBOUND" | "OUTBOUND",
        author: publicAuthor(message.direction, message.participant?.kind),
        content: { type: "text/plain" as const, body: message.body },
        status: message.status,
        occurredAt: message.occurredAt.toISOString(),
      }];
    });
    const oldest = selected[0];
    return {
      version: WEB_CHAT_CONTRACT_VERSION,
      conversation: {
        status: state.status,
        aiAutoReplyAllowed: state.mayAutoReply && this.runtime.orchestrationAvailable,
        assuranceLevel: session.assuranceLevel,
        updatedAt: conversation.updatedAt.toISOString(),
      },
      messages,
      ...(hasMore && oldest ? {
        nextCursor: this.crypto.encodeCursor({ sessionId: session.id, occurredAt: oldest.occurredAt.toISOString(), messageId: oldest.id }),
      } : {}),
      ...(!["RESOLVED", "CLOSED"].includes(state.status) ? { pollAfterMs: 5_000 } : {}),
    };
  }

  private findClientMessage(session: ActiveWebChatSession, clientMessageId: string) {
    return this.prisma.conversationMessage.findUnique({
      where: { channelSessionId_externalMessageId: { channelSessionId: session.channelSessionId, externalMessageId: clientMessageId } },
      select: { body: true, contentType: true },
    });
  }

  private async enforceRateLimit(scope: string, identity: string, max: number, windowSeconds: number) {
    try {
      const result = await this.limiter.checkAndIncrementStrict(`koral:web:${scope}:${this.crypto.rateLimitDigest(identity)}`, max, windowSeconds);
      if (result.limited) {
        throw new HttpException({ code: "RATE_LIMITED", message: "Intenta nuevamente más tarde.", retryAfterSeconds: result.retryAfterSeconds }, HttpStatus.TOO_MANY_REQUESTS);
      }
    } catch (error) {
      if (error instanceof RateLimitDependencyUnavailableError) {
        throw new ServiceUnavailableException({ code: "WEB_CHAT_SECURITY_DEPENDENCY_UNAVAILABLE", message: "El chat no está disponible temporalmente." });
      }
      throw error;
    }
  }
}

type SnapshotClient = Pick<Prisma.TransactionClient, "conversationMessage" | "conversation">;

function sessionFence(session: ActiveWebChatSession): WebChatSessionFence {
  return { sessionId: session.id, generation: session.generation, channelSessionId: session.channelSessionId };
}

function normalizeBody(value: string): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > 4_000 || containsControlCharacter(normalized, false)) {
    throw webChatConflict("INVALID_WEB_CHAT_MESSAGE", "El mensaje no tiene un formato válido.");
  }
  return normalized;
}

function normalizeDisplayName(value: string): string {
  const normalized = value.trim().replace(/\s+/gu, " ");
  if (!normalized || normalized.length > 120 || containsControlCharacter(normalized, true)) {
    throw webChatConflict("INVALID_WEB_CHAT_DISPLAY_NAME", "El nombre indicado no tiene un formato válido.");
  }
  return normalized;
}

function containsControlCharacter(value: string, rejectWhitespaceControls: boolean): boolean {
  return [...value].some((character) => {
    const code = character.charCodeAt(0);
    if (code === 127 || code === 0 || code === 11 || code === 12) return true;
    return rejectWhitespaceControls && code < 32;
  });
}

function assertMessageMatches(message: { body: string | null; contentType: string }, body: string): void {
  if (message.contentType !== "text/plain" || message.body !== body) {
    throw webChatConflict("WEB_CHAT_MESSAGE_DRIFT", "El identificador del mensaje ya fue usado con otro contenido.");
  }
}

function webChatConflict(code: string, message: string): ConflictException {
  return new ConflictException({ code, message });
}

function publicAuthor(direction: ConversationMessageDirection, participantKind?: ConversationParticipantKind): PublicWebChatMessage["author"] {
  if (direction === ConversationMessageDirection.INBOUND) return "VISITOR";
  if (participantKind === ConversationParticipantKind.HUMAN_AGENT) return "HUMAN";
  if (participantKind === ConversationParticipantKind.SYSTEM) return "SYSTEM";
  return "KORAL";
}
