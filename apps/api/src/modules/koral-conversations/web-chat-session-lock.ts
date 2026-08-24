import { UnauthorizedException } from "@nestjs/common";
import { ConversationChannel, Prisma } from "@prisma/client";

export interface WebChatSessionFence {
  sessionId: string;
  generation: number;
  channelSessionId: string;
}

export async function lockWebChatSession(tx: Prisma.TransactionClient, sessionId: string): Promise<void> {
  await tx.$queryRaw<Array<{ acquired: boolean }>>(
    Prisma.sql`SELECT true AS acquired FROM pg_advisory_xact_lock(hashtextextended(${`web-chat-session-id:${sessionId}`}, 0))`,
  );
}

export async function assertWebChatSessionFence(
  tx: Prisma.TransactionClient,
  fence: WebChatSessionFence,
  now = new Date(),
) {
  await lockWebChatSession(tx, fence.sessionId);
  const session = await tx.webChatSession.findUnique({
    where: { id: fence.sessionId },
    include: { channelSession: true },
  });
  if (
    !session
    || session.generation !== fence.generation
    || session.channelSessionId !== fence.channelSessionId
    || session.channelSession.channel !== ConversationChannel.WEB
    || session.revokedAt
    || session.idleExpiresAt <= now
    || session.absoluteExpiresAt <= now
  ) {
    throw unavailableWebChatSession();
  }
  return session;
}

export function unavailableWebChatSession(): UnauthorizedException {
  return new UnauthorizedException({
    code: "WEB_CHAT_SESSION_UNAVAILABLE",
    message: "La sesión del chat no está disponible.",
  });
}
