import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import type { Session, SessionRevocationReason } from "@prisma/client";
import { PrismaService } from "../../database/prisma.service";
import { TokenService } from "./token.service";

export interface SessionRequestContext {
  ipAddress?: string | null;
  userAgent?: string | null;
}

export interface CreateSessionResult {
  session: Session;
  rawRefreshToken: string;
}

export type RotateSessionResult = { outcome: "rotated"; session: Session; rawRefreshToken: string } | { outcome: "replay"; familyId: string };

@Injectable()
export class SessionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokenService: TokenService,
  ) {}

  /** Starts a brand-new family (a fresh login) - never used for rotation. */
  async createSession(userId: string, context: SessionRequestContext): Promise<CreateSessionResult> {
    const rawRefreshToken = this.tokenService.generateRefreshToken();
    const session = await this.prisma.session.create({
      data: {
        userId,
        familyId: randomUUID(),
        refreshTokenHash: this.tokenService.hashRefreshToken(rawRefreshToken),
        ipAddress: context.ipAddress ?? undefined,
        userAgent: context.userAgent ?? undefined,
        expiresAt: new Date(Date.now() + this.tokenService.getRefreshTtlMs()),
        lastUsedAt: new Date(),
      },
    });
    return { session, rawRefreshToken };
  }

  async findByRawRefreshToken(rawToken: string): Promise<Session | null> {
    const hash = this.tokenService.hashRefreshToken(rawToken);
    return this.prisma.session.findUnique({ where: { refreshTokenHash: hash } });
  }

  /**
   * Atomically claims rotation of `session` and, if successful, creates
   * the next-generation session in the same family. If `session` was
   * already rotated (or got revoked) by a concurrent request between the
   * caller's lookup and this call, the atomic claim (an updateMany with
   * rotatedAt: null in the WHERE clause) affects zero rows and this
   * returns {outcome: "replay"} - callers must revoke the whole family in
   * response. This is what makes "two concurrent refresh attempts must
   * not both succeed with the same token" hold even under a real race.
   */
  async rotateSession(session: Session, context: SessionRequestContext): Promise<RotateSessionResult> {
    const rawRefreshToken = this.tokenService.generateRefreshToken();
    const newRefreshTokenHash = this.tokenService.hashRefreshToken(rawRefreshToken);
    const now = new Date();

    const claim = await this.prisma.session.updateMany({
      where: { id: session.id, rotatedAt: null, revokedAt: null },
      data: { rotatedAt: now },
    });

    if (claim.count === 0) {
      // Lost the race, or the token was already rotated/revoked before we
      // got here - either way, the caller must treat this as a replay.
      return { outcome: "replay", familyId: session.familyId };
    }

    // The atomic claim above is the only step that needs race protection.
    // Creating the next-generation session and linking it back is safe to
    // do as two plain sequential statements: on a crash between them, the
    // old token is already invalidated (rotatedAt is set) and no new
    // token was issued, so the user simply has to log in again - not a
    // security hole, just a UX hiccup on an extremely rare failure.
    const newSession = await this.prisma.session.create({
      data: {
        userId: session.userId,
        familyId: session.familyId,
        refreshTokenHash: newRefreshTokenHash,
        ipAddress: context.ipAddress ?? undefined,
        userAgent: context.userAgent ?? undefined,
        expiresAt: new Date(Date.now() + this.tokenService.getRefreshTtlMs()),
        lastUsedAt: now,
      },
    });
    await this.prisma.session.update({
      where: { id: session.id },
      data: { rotatedToSessionId: newSession.id },
    });

    return { outcome: "rotated", session: newSession, rawRefreshToken };
  }

  /** Every session ever created for this user, newest first - the
   * admin-facing session-visibility list (US-011). Returns full rows
   * (including refreshTokenHash) - callers exposing this over HTTP must
   * map to a safe subset themselves, never forward a row unmapped. */
  async listSessionsForUser(userId: string): Promise<Session[]> {
    return this.prisma.session.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });
  }

  async revokeSession(sessionId: string, reason: SessionRevocationReason): Promise<void> {
    await this.prisma.session.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: reason },
    });
  }

  async revokeFamily(familyId: string, reason: SessionRevocationReason): Promise<void> {
    await this.prisma.session.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: reason },
    });
  }

  async revokeAllForUser(userId: string, reason: SessionRevocationReason): Promise<void> {
    await this.prisma.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: reason },
    });
  }

  /**
   * Revokes every other session's *refresh token* for the user,
   * deliberately leaving `exceptSessionId`'s row untouched - used by
   * change-password (US-007), where the documented decision is that the
   * session performing the change keeps its refresh token (the user
   * already proved both the old and new password in that same session),
   * while every *other* session's refresh token is revoked outright.
   * This is independent of JwtAuthGuard's passwordChangedAt check, which
   * is universal and invalidates *every* already-issued access token
   * including this one - so the acting device still needs one /refresh
   * call to mint a new access token, it just never needs a full
   * re-login. Password *reset* is different: revokeAllForUser() applies
   * there with no exception, since a reset proves identity only via
   * possibly-compromised email access, not an active authenticated
   * session.
   */
  async revokeAllForUserExcept(userId: string, exceptSessionId: string, reason: SessionRevocationReason): Promise<void> {
    await this.prisma.session.updateMany({
      where: { userId, id: { not: exceptSessionId }, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: reason },
    });
  }

  isUsable(session: Session): boolean {
    if (session.revokedAt) return false;
    if (session.rotatedAt) return false;
    if (session.expiresAt.getTime() <= Date.now()) return false;
    return true;
  }

  async touchLastUsed(sessionId: string): Promise<void> {
    await this.prisma.session.update({ where: { id: sessionId }, data: { lastUsedAt: new Date() } });
  }
}
