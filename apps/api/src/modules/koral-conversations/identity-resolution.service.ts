import { createHash } from "node:crypto";
import { BadRequestException, ConflictException, Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ConversationChannel, UserStatus } from "@prisma/client";
import type { EnvConfig } from "../../config/env.validation";
import { PrismaService } from "../../database/prisma.service";
import { SessionService } from "../auth/session.service";
import {
  IDENTITY_RESOLUTION_CONTRACT_VERSION,
  type ResolvedChannelIdentity,
  type ResolvedIdentityContext,
  type VerifiedIdentityAttribute,
} from "./contracts/identity-resolution.contract";

export interface IdentityResolutionResult {
  identity: ResolvedIdentityContext;
  reason: string;
  evidenceReference: string;
}

interface ChannelEvidence {
  channel: ConversationChannel;
  externalIdentityId: string;
}

interface ClaimedEvidence extends ChannelEvidence {
  claimedIdentityId: string;
  evidenceReference: string;
}

interface MatchedEvidence extends ChannelEvidence {
  candidateIdentityIds: readonly string[];
  evidenceReference: string;
}

interface VerifiedEvidence extends ChannelEvidence {
  identityId: string;
  evidenceReference: string;
  verifiedAttributes: readonly VerifiedIdentityAttribute[];
  contactId?: string;
}

interface AuthenticatedEvidence extends ChannelEvidence {
  userId: string;
  sessionId: string;
}

@Injectable()
export class KoralIdentityResolutionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionService,
    private readonly config: ConfigService<EnvConfig, true>,
  ) {}

  resolveAnonymous(input: ChannelEvidence): IdentityResolutionResult {
    const channel = channelIdentity(input, false);
    return result(
      `anonymous:${digest(`${channel.channel}:${channel.externalIdentityId}`)}`,
      "ANONYMOUS",
      channel,
      "CHANNEL_ANONYMOUS",
      `channel:${digest(`${channel.channel}:${channel.externalIdentityId}`)}`,
    );
  }

  resolveClaimed(input: ClaimedEvidence): IdentityResolutionResult {
    const identityId = safeIdentifier(input.claimedIdentityId, "claimedIdentityId");
    return result(identityId, "CLAIMED", channelIdentity(input, false), "IDENTITY_CLAIMED", safeEvidence(input.evidenceReference));
  }

  resolveMatched(input: MatchedEvidence): IdentityResolutionResult {
    const candidates = [...new Set(input.candidateIdentityIds.map((value) => safeIdentifier(value, "candidateIdentityId")))];
    if (candidates.length !== 1) throw new ConflictException("AMBIGUOUS_IDENTITY");
    return result(candidates[0]!, "MATCHED", channelIdentity(input, false), "IDENTITY_MATCHED", safeEvidence(input.evidenceReference));
  }

  resolveVerified(input: VerifiedEvidence): IdentityResolutionResult {
    if (input.verifiedAttributes.length === 0) throw new BadRequestException("VERIFIED_ATTRIBUTE_REQUIRED");
    const attributes = input.verifiedAttributes.map((attribute) => ({
      name: safeIdentifier(attribute.name, "attributeName"),
      source: safeIdentifier(attribute.source, "attributeSource"),
      verifiedAt: validTimestamp(attribute.verifiedAt),
    }));
    const resolved = result(
      safeIdentifier(input.identityId, "identityId"),
      "VERIFIED",
      channelIdentity(input, true),
      "IDENTITY_ATTRIBUTE_VERIFIED",
      safeEvidence(input.evidenceReference),
    );
    return {
      ...resolved,
      identity: {
        ...resolved.identity,
        contactId: input.contactId ? safeIdentifier(input.contactId, "contactId") : undefined,
        verifiedAttributes: attributes,
      },
    };
  }

  async resolveAuthenticated(input: AuthenticatedEvidence, now = new Date()): Promise<IdentityResolutionResult> {
    const userId = safeIdentifier(input.userId, "userId");
    const user = await this.prisma.user.findFirst({ where: { id: userId, status: UserStatus.ACTIVE }, select: { id: true } });
    if (!user) throw new UnauthorizedException("AUTHENTICATED_IDENTITY_UNAVAILABLE");
    const session = await this.sessions.findStepUpState(safeIdentifier(input.sessionId, "sessionId"), userId, now);
    if (!session) throw new UnauthorizedException("AUTHENTICATION_EVIDENCE_INVALID");

    const ttl = this.config.get("ADMIN_STEP_UP_TTL_SECONDS", { infer: true }) * 1_000;
    const freshMfa = session.mfaVerifiedAt !== null && session.mfaVerifiedAt.getTime() >= now.getTime() - ttl;
    const freshRecentAuth = session.recentAuthenticationAt !== null && session.recentAuthenticationAt.getTime() >= now.getTime() - ttl;
    const assurance = freshMfa && freshRecentAuth ? "STEP_UP_VERIFIED" : session.mfaVerifiedAt ? "MFA_VERIFIED" : "AUTHENTICATED";

    const resolved = result(
      `portal-user:${user.id}`,
      assurance,
      channelIdentity(input, true),
      assurance === "STEP_UP_VERIFIED" ? "ACTIVE_STEP_UP_SESSION" : assurance === "MFA_VERIFIED" ? "MFA_SESSION" : "ACTIVE_SESSION",
      `session:${digest(input.sessionId)}`,
    );
    return {
      ...resolved,
      identity: {
        ...resolved.identity,
        portalUserId: user.id,
        authenticationEvidence: {
          authenticated: true,
          mfaVerified: assurance === "MFA_VERIFIED" || assurance === "STEP_UP_VERIFIED",
          stepUpVerified: assurance === "STEP_UP_VERIFIED",
        },
        consentState: {
          // Authentication is not consent. A future consent resolver must
          // provide authoritative purpose evidence through its own boundary.
          status: "UNKNOWN",
          purposeKeys: [],
        },
      },
    };
  }
}

function result(
  identityId: string,
  assuranceLevel: ResolvedIdentityContext["assuranceLevel"],
  channelIdentityValue: ResolvedChannelIdentity,
  reason: string,
  evidenceReference: string,
): IdentityResolutionResult {
  return {
    reason,
    evidenceReference,
    identity: {
      version: IDENTITY_RESOLUTION_CONTRACT_VERSION,
      identityId,
      channelIdentities: [channelIdentityValue],
      assuranceLevel,
      authenticationEvidence: { authenticated: false, mfaVerified: false, stepUpVerified: false },
      consentState: { status: "UNKNOWN", purposeKeys: [] },
      verifiedAttributes: [],
    },
  };
}

function channelIdentity(input: ChannelEvidence, verified: boolean): ResolvedChannelIdentity {
  return {
    channel: input.channel,
    externalIdentityId: safeIdentifier(input.externalIdentityId, "externalIdentityId"),
    verified,
  };
}

export function safeEvidence(value: string): string {
  const normalized = value.trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9:._/-]{0,199}$/.test(normalized)) throw new BadRequestException("INVALID_EVIDENCE_REFERENCE");
  return normalized;
}

function safeIdentifier(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > 200 || containsControlCharacter(normalized)) {
    throw new BadRequestException(`INVALID_${field.toUpperCase()}`);
  }
  return normalized;
}

function validTimestamp(value: string): string {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) throw new BadRequestException("INVALID_VERIFICATION_TIMESTAMP");
  return new Date(timestamp).toISOString();
}

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 32);
}

function containsControlCharacter(value: string): boolean {
  return [...value].some((character) => {
    const code = character.charCodeAt(0);
    return code < 32 || code === 127;
  });
}
