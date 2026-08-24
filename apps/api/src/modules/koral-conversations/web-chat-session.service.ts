import { randomUUID } from "node:crypto";
import { Injectable, UnauthorizedException } from "@nestjs/common";
import { AuditEventResult, ConversationChannel, ConversationStatus, Prisma } from "@prisma/client";
import { PrismaService } from "../../database/prisma.service";
import { WebChatCryptoService } from "./web-chat-crypto.service";
import { lockWebChatSession, unavailableWebChatSession } from "./web-chat-session-lock";

const IDLE_TTL_MS = 30 * 60 * 1_000;
const ABSOLUTE_TTL_MS = 24 * 60 * 60 * 1_000;

export type ActiveWebChatSession = Awaited<ReturnType<WebChatSessionService["authenticate"]>>;
export type WebChatSessionTransactionHook<T> = (tx: Prisma.TransactionClient, session: ActiveWebChatSession) => Promise<T>;

@Injectable()
export class WebChatSessionService {
  constructor(private readonly prisma: PrismaService, private readonly crypto: WebChatCryptoService) {}

  async bootstrap<T>(rawToken: string | undefined, correlationId: string, hook: WebChatSessionTransactionHook<T>, now = new Date()) {
    if (rawToken) {
      const rotated = await this.rotateCapability(rawToken, correlationId, hook, now);
      return { session: rotated.session, rawToken: rotated.rawToken, created: false as const, hookResult: rotated.hookResult };
    }
    const token = this.crypto.issueToken();
    const digest = this.crypto.tokenDigest(token);
    const identityId = `web-visitor:${randomUUID()}`;
    const externalSessionId = randomUUID();
    const created = await this.prisma.$transaction(async (tx) => {
      const transactionNow = new Date();
      const absoluteExpiresAt = new Date(transactionNow.getTime() + ABSOLUTE_TTL_MS);
      const idleExpiresAt = new Date(Math.min(transactionNow.getTime() + IDLE_TTL_MS, absoluteExpiresAt.getTime()));
      const conversation = await tx.conversation.create({ data: { status: ConversationStatus.AI_ACTIVE } });
      const channelSession = await tx.conversationChannelSession.create({
        data: {
          conversationId: conversation.id,
          channel: ConversationChannel.WEB,
          externalSessionId,
          adapterVersion: "web-server-v1",
          lastSeenAt: transactionNow,
        },
      });
      const created = await tx.webChatSession.create({
        data: { channelSessionId: channelSession.id, tokenDigest: digest, identityId, idleExpiresAt, absoluteExpiresAt, lastSeenAt: transactionNow },
        include: { channelSession: { include: { conversation: true } } },
      });
      await tx.conversationEvent.create({
        data: {
          conversationId: conversation.id,
          eventType: "WEB_CHAT_SESSION_BOOTSTRAPPED",
          correlationId,
          idempotencyKey: `web-session:${created.id}`,
          previousStatus: conversation.status,
          newStatus: conversation.status,
          result: AuditEventResult.SUCCESS,
          metadata: { webChatSessionId: created.id, channel: ConversationChannel.WEB },
        },
      });
      const hookResult = await hook(tx, created);
      return { session: created, hookResult };
    });
    return { ...created, rawToken: token, created: true as const };
  }

  async authenticate(rawToken: string, now = new Date()) {
    if (!/^[A-Za-z0-9_-]{43}$/u.test(rawToken)) throw unavailableSession();
    const tokenDigest = this.crypto.tokenDigest(rawToken);
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw<Array<{ acquired: boolean }>>(
        Prisma.sql`SELECT true AS acquired FROM pg_advisory_xact_lock(hashtextextended(${`web-chat-session:${tokenDigest}`}, 0))`,
      );
      const existing = await tx.webChatSession.findUnique({ where: { tokenDigest } });
      if (!existing) {
        throw unavailableSession();
      }
      await lockWebChatSession(tx, existing.id);
      const current = await tx.webChatSession.findUnique({ where: { id: existing.id } });
      if (!current || current.tokenDigest !== tokenDigest || current.revokedAt || current.idleExpiresAt <= now || current.absoluteExpiresAt <= now) throw unavailableSession();
      const idleExpiresAt = new Date(Math.min(now.getTime() + IDLE_TTL_MS, current.absoluteExpiresAt.getTime()));
      return tx.webChatSession.update({
        where: { id: current.id },
        data: { lastSeenAt: now, idleExpiresAt },
        include: { channelSession: { include: { conversation: true } } },
      });
    });
  }

  async revoke(rawToken: string, now = new Date()): Promise<void> {
    if (!/^[A-Za-z0-9_-]{43}$/u.test(rawToken)) throw unavailableSession();
    const tokenDigest = this.crypto.tokenDigest(rawToken);
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw<Array<{ acquired: boolean }>>(
        Prisma.sql`SELECT true AS acquired FROM pg_advisory_xact_lock(hashtextextended(${`web-chat-session:${tokenDigest}`}, 0))`,
      );
      const session = await tx.webChatSession.findUnique({
        where: { tokenDigest },
        include: { channelSession: true },
      });
      if (!session) throw unavailableSession();
      await lockWebChatSession(tx, session.id);
      const current = await tx.webChatSession.findUnique({ where: { id: session.id }, include: { channelSession: true } });
      if (!current || current.tokenDigest !== tokenDigest) throw unavailableSession();
      if (current.revokedAt) return;
      await tx.webChatSession.update({ where: { id: current.id }, data: { revokedAt: now, generation: { increment: 1 } } });
      await tx.conversationEvent.create({
        data: {
          conversationId: current.channelSession.conversationId,
          eventType: "WEB_CHAT_SESSION_REVOKED",
          correlationId: randomUUID(),
          idempotencyKey: `web-session-revoked:${current.id}`,
          result: AuditEventResult.SUCCESS,
          reason: "SERVER_SIDE_REVOCATION",
          metadata: { webChatSessionId: current.id },
        },
      });
    });
  }

  private async rotateCapability<T>(rawToken: string, correlationId: string, hook: WebChatSessionTransactionHook<T>, now: Date) {
    if (!/^[A-Za-z0-9_-]{43}$/u.test(rawToken)) throw unavailableSession();
    const oldDigest = this.crypto.tokenDigest(rawToken);
    const nextRawToken = this.crypto.issueToken();
    const nextDigest = this.crypto.tokenDigest(nextRawToken);
    const session = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw<Array<{ acquired: boolean }>>(
        Prisma.sql`SELECT true AS acquired FROM pg_advisory_xact_lock(hashtextextended(${`web-chat-session:${oldDigest}`}, 0))`,
      );
      const existing = await tx.webChatSession.findUnique({ where: { tokenDigest: oldDigest } });
      if (!existing) {
        throw unavailableSession();
      }
      await lockWebChatSession(tx, existing.id);
      const current = await tx.webChatSession.findUnique({ where: { id: existing.id } });
      if (!current || current.tokenDigest !== oldDigest || current.revokedAt || current.idleExpiresAt <= now || current.absoluteExpiresAt <= now) throw unavailableSession();
      const idleExpiresAt = new Date(Math.min(now.getTime() + IDLE_TTL_MS, current.absoluteExpiresAt.getTime()));
      const updated = await tx.webChatSession.update({
        where: { id: current.id },
        data: { tokenDigest: nextDigest, generation: { increment: 1 }, lastSeenAt: now, idleExpiresAt },
        include: { channelSession: { include: { conversation: true } } },
      });
      await tx.conversationEvent.create({
        data: {
          conversationId: updated.channelSession.conversationId,
          eventType: "WEB_CHAT_SESSION_ROTATED",
          correlationId,
          idempotencyKey: `web-session-rotation:${randomUUID()}`,
          result: AuditEventResult.SUCCESS,
          metadata: { webChatSessionId: updated.id },
        },
      });
      const hookResult = await hook(tx, updated);
      return { session: updated, hookResult };
    });
    return { ...session, rawToken: nextRawToken };
  }

}

function unavailableSession(): UnauthorizedException {
  return unavailableWebChatSession();
}
