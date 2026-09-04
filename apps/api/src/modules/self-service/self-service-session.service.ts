import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { SelfServicePortal } from "@prisma/client";
import type { Response } from "express";
import { PrismaService } from "../../database/prisma.service";
import type { EnvConfig } from "../../config/env.validation";
import { SelfServiceCryptoService } from "./self-service-crypto.service";

const SELF_SERVICE_COOKIES: Record<SelfServicePortal, string> = {
  [SelfServicePortal.AFFILIATE]: "asodef_affiliate_ss",
  [SelfServicePortal.COMPANY]: "asodef_company_ss",
};

export type SelfServiceAssurance = "OTP" | "LOOKUP";

export function selfServiceCookieName(portal: SelfServicePortal): string {
  return SELF_SERVICE_COOKIES[portal];
}

export interface SelfServicePrincipal {
  sessionId: string;
  portal: SelfServicePortal;
  subjectRef: string;
  scopes: readonly string[];
  assurance: SelfServiceAssurance;
  csrfTokenHash: string;
  expiresAt: Date;
}

@Injectable()
export class SelfServiceSessionService {
  private readonly ttlMinutes: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: SelfServiceCryptoService,
    config: ConfigService<EnvConfig, true>,
  ) {
    this.ttlMinutes = config.get("SELF_SERVICE_SESSION_TTL_MINUTES", { infer: true });
  }

  create(challengeId: string, portal: SelfServicePortal, subjectRef: string, context: { ipAddress: string | null; userAgent: string | null }) {
    return this.createSession(challengeId, portal, subjectRef, context, "OTP");
  }

  createLookup(challengeId: string, portal: SelfServicePortal, subjectRef: string, context: { ipAddress: string | null; userAgent: string | null }) {
    return this.createSession(challengeId, portal, subjectRef, context, "LOOKUP");
  }

  private async createSession(
    challengeId: string,
    portal: SelfServicePortal,
    subjectRef: string,
    context: { ipAddress: string | null; userAgent: string | null },
    assurance: SelfServiceAssurance,
  ) {
    const rawToken = this.crypto.generateToken();
    const csrfToken = this.crypto.generateToken();
    const expiresAt = new Date(Date.now() + this.ttlMinutes * 60_000);

    // The current business decision is that lack of the WhatsApp OTP transport
    // must not disable ordinary portal operations. LOOKUP sessions therefore
    // retain the approved operational scopes below, while beneficiary changes
    // and sensitive-document upload remain OTP-only. The session is still
    // short-lived, browser-bound, HttpOnly and CSRF-protected.
    const lookupScopes = portal === SelfServicePortal.AFFILIATE
      ? [
          "affiliate:summary:read",
          "affiliate:contracts:read",
          "affiliate:beneficiaries:read",
          "affiliate:account:read",
          "affiliate:payments:read",
          "affiliate:documents:read",
          "affiliate:requests:read",
          "affiliate:contact:manage",
          "affiliate:profile:update",
          "payments:read",
          "payments:quote",
          "payments:apply",
        ]
      : [
          "company:summary:read",
          "company:benefits:read",
          "company:contracts:read",
          "company:payments:read",
          "company:documents:read",
          "company:requests:read",
          "company:reports:read",
          "payments:read",
          "payments:quote",
          "payments:apply",
        ];
    const otpOnlyScopes = portal === SelfServicePortal.AFFILIATE
      ? [
          "affiliate:beneficiaries:manage",
          "affiliate:documents:upload",
        ]
      : [];
    const scopes = assurance === "OTP" ? [...lookupScopes, ...otpOnlyScopes] : lookupScopes;
    const session = await this.prisma.selfServiceSession.create({ data: {
      challengeId,
      portal,
      subjectRefEncrypted: this.crypto.encrypt(subjectRef),
      tokenHash: this.crypto.hash(rawToken),
      csrfTokenHash: this.crypto.hash(csrfToken),
      scopes,
      assurance,
      ipHash: context.ipAddress ? this.crypto.fingerprint(context.ipAddress) : null,
      userAgentHash: context.userAgent ? this.crypto.fingerprint(context.userAgent) : null,
      expiresAt,
    } });
    return { sessionId: session.id, rawToken, csrfToken, expiresAt, scopes, assurance };
  }

  async resolve(rawToken: string | undefined, context?: { ipAddress: string | null; userAgent: string | null }): Promise<SelfServicePrincipal | null> {
    if (!rawToken) return null;
    const session = await this.prisma.selfServiceSession.findUnique({ where: { tokenHash: this.crypto.hash(rawToken) } });
    if (!session || session.revokedAt || session.expiresAt <= new Date()) return null;
    const assurance = session.assurance === "OTP" || session.assurance === "LOOKUP" ? session.assurance : null;
    if (!assurance) return null;
    if (context) {
      const currentIpHash = context.ipAddress ? this.crypto.fingerprint(context.ipAddress) : null;
      const currentAgentHash = context.userAgent ? this.crypto.fingerprint(context.userAgent) : null;
      if ((session.ipHash && session.ipHash !== currentIpHash) || (session.userAgentHash && session.userAgentHash !== currentAgentHash)) return null;
    }
    await this.prisma.selfServiceSession.update({ where: { id: session.id }, data: { lastUsedAt: new Date() } });
    return {
      sessionId: session.id,
      portal: session.portal,
      subjectRef: this.crypto.decrypt(session.subjectRefEncrypted),
      scopes: session.scopes,
      assurance,
      csrfTokenHash: session.csrfTokenHash,
      expiresAt: session.expiresAt,
    };
  }

  async rotateCsrf(principal: SelfServicePrincipal): Promise<string | null> {
    const token = this.crypto.generateToken();
    const tokenHash = this.crypto.hash(token);
    const rotated = await this.prisma.selfServiceSession.updateMany({
      where: { id: principal.sessionId, csrfTokenHash: principal.csrfTokenHash, revokedAt: null, expiresAt: { gt: new Date() } },
      data: { csrfTokenHash: tokenHash },
    });
    if (rotated.count !== 1) return null;
    principal.csrfTokenHash = tokenHash;
    return token;
  }

  async consumeCsrf(principal: SelfServicePrincipal, token: string | undefined): Promise<string | null> {
    if (!token || !this.crypto.matches(principal.csrfTokenHash, this.crypto.hash(token))) return null;
    return this.rotateCsrf(principal);
  }

  async revoke(sessionId: string): Promise<void> {
    await this.prisma.selfServiceSession.updateMany({ where: { id: sessionId, revokedAt: null }, data: { revokedAt: new Date() } });
  }
}

@Injectable()
export class SelfServiceCookieService {
  private readonly secure: boolean;
  constructor(config: ConfigService<EnvConfig, true>) { this.secure = config.get("NODE_ENV", { infer: true }) === "production"; }
  set(response: Response, portal: SelfServicePortal, rawToken: string, expiresAt: Date): void {
    response.cookie(selfServiceCookieName(portal), rawToken, { httpOnly: true, sameSite: "strict", secure: this.secure, path: "/api/v1/self-service", expires: expiresAt });
  }
  clear(response: Response, portal: SelfServicePortal): void {
    response.clearCookie(selfServiceCookieName(portal), { httpOnly: true, sameSite: "strict", secure: this.secure, path: "/api/v1/self-service" });
  }
}
