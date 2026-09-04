import { HttpException, HttpStatus, Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { SelfServiceChallengeStatus, SelfServicePortal } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { PrismaService } from "../../database/prisma.service";
import { RateLimiterService } from "../auth/rate-limiter.service";
import type { RequestContext } from "../auth/auth.service";
import type { EnvConfig } from "../../config/env.validation";
import {
  EXTERNAL_CORE_PROVIDER,
  SELF_SERVICE_MESSAGE_PROVIDER,
  type AffiliateLookupInput,
  type ContactDestination,
  type ExternalCoreProvider,
  type ProviderResult,
  type SelfServiceChannel,
  type SelfServiceMessageProvider,
  type VerificationChannel,
} from "./external-core.provider";
import { SelfServiceCryptoService } from "./self-service-crypto.service";
import { SelfServiceSessionService } from "./self-service-session.service";

const LOOKUP_MINUTES = 10;
const START_WINDOW_SECONDS = 60;
const VERIFY_WINDOW_SECONDS = 900;

type SafeFailure = Extract<ProviderResult<never>, { status: "NOT_CONFIGURED" | "UNAVAILABLE" }>;
type StoredChannel = Pick<VerificationChannel, "id" | "type" | "masked" | "enabled" | "verified" | "lastUpdatedAt" | "operationalCommunicationPermission">;

@Injectable()
export class SelfServiceAccessService {
  private readonly otpMinutes: number;
  private readonly otpMaxAttempts: number;
  private readonly deliveryCooldownSeconds: number;
  private readonly otpEnabled: boolean;

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: SelfServiceCryptoService,
    private readonly sessions: SelfServiceSessionService,
    private readonly limiter: RateLimiterService,
    @Inject(EXTERNAL_CORE_PROVIDER) private readonly core: ExternalCoreProvider,
    @Inject(SELF_SERVICE_MESSAGE_PROVIDER) private readonly messages: SelfServiceMessageProvider,
    config: ConfigService<EnvConfig, true>,
  ) {
    this.otpMinutes = config.get("SELF_SERVICE_OTP_TTL_MINUTES", { infer: true });
    this.otpMaxAttempts = config.get("SELF_SERVICE_OTP_MAX_ATTEMPTS", { infer: true });
    this.deliveryCooldownSeconds = config.get("SELF_SERVICE_OTP_COOLDOWN_SECONDS", { infer: true });
    this.otpEnabled = config.get("SELF_SERVICE_MESSAGE_PROVIDER", { infer: true }) === "whatsapp";
  }

  startAffiliate(input: AffiliateLookupInput, context: RequestContext) {
    const lookupKey = `${input.identifierMode}:${input.identifierMode === "DOCUMENT" ? input.documentType : ""}:${input.identifier}`;
    return this.start(SelfServicePortal.AFFILIATE, lookupKey, context, input);
  }

  startCompany(nit: string, context: RequestContext) {
    return this.start(SelfServicePortal.COMPANY, nit, context);
  }

  private async start(portal: SelfServicePortal, identifier: string, context: RequestContext, affiliateInput?: AffiliateLookupInput) {
    const lookupHash = this.crypto.fingerprint(`${portal}:${identifier}`);
    const ipHash = this.ipHash(context);
    await this.enforceRateLimit(`self-service:start:${ipHash}:${lookupHash}`, 3, START_WINDOW_SECONDS);

    const lookup = portal === SelfServicePortal.AFFILIATE
      ? await this.core.startAffiliateLookup(affiliateInput!)
      : await this.core.startCompanyLookupByNit({ nit: identifier });
    if (lookup.status !== "VERIFIED") {
      await this.audit(portal, "ACCESS_START", lookup.status, { ipHash });
      if (lookup.status === "NOT_CONFIGURED") return { status: lookup.status, error: lookup.error };
      if (lookup.disclosureAllowed) return { status: "UNAVAILABLE" as const, error: lookup.error };
      return this.unavailable("ACCESS_UNAVAILABLE");
    }

    if (!this.otpEnabled) {
      return this.createLookupSession(portal, lookupHash, lookup.data.subjectRef, context, ipHash);
    }

    const [channels, destinations] = portal === SelfServicePortal.AFFILIATE
      ? await Promise.all([
          this.core.getAffiliateVerificationChannels(lookup.data.subjectRef),
          this.core.getAffiliateContactDestinations(lookup.data.subjectRef),
        ])
      : await Promise.all([
          this.core.getCompanyVerificationChannels(lookup.data.subjectRef),
          this.core.getCompanyContactDestinations(lookup.data.subjectRef),
        ]);
    if (channels.status !== "VERIFIED") {
      await this.audit(portal, "ACCESS_CHANNEL_DISCOVERY", channels.status, { ipHash });
      return channels;
    }
    if (destinations.status !== "VERIFIED") {
      await this.audit(portal, "ACCESS_CHANNEL_DISCOVERY", destinations.status, { ipHash });
      return destinations;
    }

    const matched = this.matchChannels(channels.data, destinations.data);
    if (matched.length === 0) {
      await this.audit(portal, "ACCESS_CHANNEL_DISCOVERY", "UNAVAILABLE", { ipHash });
      return this.unavailable("ACCESS_CHANNEL_UNAVAILABLE");
    }

    const id = randomUUID();
    const expiresAt = new Date(Date.now() + LOOKUP_MINUTES * 60_000);
    const safeChannels: StoredChannel[] = matched.map(({ channel }) => ({
      id: channel.id,
      type: channel.type,
      masked: channel.masked,
      enabled: channel.enabled,
      verified: channel.verified,
      lastUpdatedAt: channel.lastUpdatedAt,
      operationalCommunicationPermission: channel.operationalCommunicationPermission,
    }));
    const privateDestinations = matched.map(({ destination }) => ({
      id: destination.id,
      type: destination.type,
      destination: destination.destination,
      enabled: destination.enabled,
      verified: destination.verified,
      lastUpdatedAt: destination.lastUpdatedAt,
      operationalCommunicationPermission: destination.operationalCommunicationPermission,
    }));
    await this.prisma.selfServiceAccessLookup.create({
      data: {
        id,
        portal,
        lookupHash,
        subjectRefEncrypted: this.crypto.encrypt(lookup.data.subjectRef),
        browserBindingHash: this.browserBindingHash(context),
        channels: safeChannels,
        destinationsEncrypted: this.crypto.encrypt(JSON.stringify(privateDestinations)),
        expiresAt,
      },
    });
    await this.audit(portal, "ACCESS_CHANNEL_DISCOVERY", "CHALLENGE_REQUIRED", { ipHash });
    return {
      status: "CHALLENGE_REQUIRED" as const,
      providerReference: id,
      channels: safeChannels.map((channel) => ({
        providerReference: channel.id,
        channel: channel.type,
        maskedDestination: channel.masked,
        availability: "AVAILABLE" as const,
        cooldownSeconds: 0,
      })),
      expiresAt,
    };
  }

  async requestCode(portal: SelfServicePortal, providerReference: string, channelReference: string, context: RequestContext) {
    const ipHash = this.ipHash(context);
    await this.enforceRateLimit(
      `self-service:request-code:${ipHash}:${this.crypto.hash(`${providerReference}:${channelReference}`)}`,
      3,
      START_WINDOW_SECONDS,
    );
    const lookup = await this.prisma.selfServiceAccessLookup.findUnique({ where: { id: providerReference } });
    if (
      !lookup ||
      lookup.portal !== portal ||
      lookup.expiresAt <= new Date() ||
      !this.crypto.matches(lookup.browserBindingHash, this.browserBindingHash(context))
    ) return this.invalidLookup();

    const channel = this.readChannels(lookup.channels).find((candidate) => candidate.id === channelReference);
    const destination = this.readDestinations(lookup.destinationsEncrypted).find(
      (candidate) => candidate.id === channelReference && candidate.type === channel?.type,
    );
    if (!channel || !destination) return this.invalidLookup();

    const challengeId = randomUUID();
    const code = this.crypto.generateOtp();
    const delivered = await this.messages.deliverOtp({
      channel: channel.type,
      destination: destination.destination,
      code,
      expiresInMinutes: this.otpMinutes,
    });
    if (delivered.status !== "VERIFIED") {
      await this.audit(portal, "OTP_DELIVERY", delivered.status, { ipHash });
      return delivered;
    }

    const now = Date.now();
    const expiresAt = new Date(now + this.otpMinutes * 60_000);
    const challenge = await this.prisma.selfServiceOtpChallenge.create({
      data: {
        id: challengeId,
        accessLookupId: lookup.id,
        portal,
        lookupHash: lookup.lookupHash,
        subjectRefEncrypted: lookup.subjectRefEncrypted,
        browserBindingHash: lookup.browserBindingHash,
        channel: channel.type,
        channelReference: channel.id,
        destinationMasked: channel.masked,
        codeHash: this.crypto.hashOtp(challengeId, code),
        maxAttempts: this.otpMaxAttempts,
        expiresAt,
        retryAvailableAt: new Date(now + this.deliveryCooldownSeconds * 1000),
      },
    });
    await this.audit(portal, "OTP_DELIVERY", "CHALLENGE_REQUIRED", { challengeId: challenge.id, ipHash });
    return this.challengeResponse(challenge.id, channel.type, channel.masked, expiresAt, this.deliveryCooldownSeconds);
  }

  async resend(portal: SelfServicePortal, challengeId: string, context: RequestContext) {
    const ipHash = this.ipHash(context);
    await this.enforceRateLimit(
      `self-service:resend:${ipHash}:${this.crypto.hash(challengeId)}`,
      5,
      VERIFY_WINDOW_SECONDS,
    );
    const challenge = await this.prisma.selfServiceOtpChallenge.findUnique({
      where: { id: challengeId },
      include: { accessLookup: true },
    });
    const now = new Date();
    if (
      !challenge ||
      challenge.portal !== portal ||
      challenge.status !== SelfServiceChallengeStatus.PENDING ||
      challenge.accessLookup.expiresAt <= now ||
      !this.crypto.matches(challenge.browserBindingHash, this.browserBindingHash(context))
    ) return this.invalidChallenge();

    if (challenge.retryAvailableAt > now) {
      return this.challengeResponse(
        challenge.id,
        this.readChannel(challenge.channel),
        challenge.destinationMasked,
        challenge.expiresAt,
        Math.max(1, Math.ceil((challenge.retryAvailableAt.getTime() - now.getTime()) / 1000)),
      );
    }

    const reservationUntil = new Date(now.getTime() + this.deliveryCooldownSeconds * 1000);
    const reservation = await this.prisma.selfServiceOtpChallenge.updateMany({
      where: {
        id: challenge.id,
        status: SelfServiceChallengeStatus.PENDING,
        retryAvailableAt: { lte: now },
      },
      data: { retryAvailableAt: reservationUntil },
    });
    if (reservation.count !== 1) {
      return this.challengeResponse(
        challenge.id,
        this.readChannel(challenge.channel),
        challenge.destinationMasked,
        challenge.expiresAt,
        this.deliveryCooldownSeconds,
      );
    }

    const channel = this.readChannel(challenge.channel);
    const destination = this.readDestinations(challenge.accessLookup.destinationsEncrypted).find(
      (candidate) => candidate.id === challenge.channelReference && candidate.type === channel,
    );
    if (!destination) return this.invalidChallenge();

    const code = this.crypto.generateOtp();
    const delivered = await this.messages.deliverOtp({
      channel,
      destination: destination.destination,
      code,
      expiresInMinutes: this.otpMinutes,
    });
    if (delivered.status !== "VERIFIED") {
      await this.prisma.selfServiceOtpChallenge.update({
        where: { id: challenge.id },
        data: { retryAvailableAt: now },
      });
      await this.audit(portal, "OTP_RESEND", delivered.status, { challengeId: challenge.id, ipHash });
      return delivered;
    }

    const expiresAt = new Date(now.getTime() + this.otpMinutes * 60_000);
    await this.prisma.selfServiceOtpChallenge.update({
      where: { id: challenge.id },
      data: {
        codeHash: this.crypto.hashOtp(challenge.id, code),
        expiresAt,
        retryAvailableAt: reservationUntil,
        attempts: 0,
        lockedAt: null,
      },
    });
    await this.audit(portal, "OTP_RESEND", "CHALLENGE_REQUIRED", { challengeId: challenge.id, ipHash });
    return this.challengeResponse(challenge.id, channel, challenge.destinationMasked, expiresAt, this.deliveryCooldownSeconds);
  }

  async verify(portal: SelfServicePortal, challengeId: string, code: string, context: RequestContext) {
    const ipHash = this.ipHash(context);
    await this.enforceRateLimit(`self-service:verify:${ipHash}:${this.crypto.hash(challengeId)}`, 10, VERIFY_WINDOW_SECONDS);
    const challenge = await this.prisma.selfServiceOtpChallenge.findUnique({ where: { id: challengeId } });
    if (
      !challenge ||
      challenge.portal !== portal ||
      challenge.status !== SelfServiceChallengeStatus.PENDING ||
      !this.crypto.matches(challenge.browserBindingHash, this.browserBindingHash(context))
    ) return this.invalidChallenge();
    if (challenge.expiresAt <= new Date()) {
      await this.prisma.selfServiceOtpChallenge.update({ where: { id: challenge.id }, data: { status: SelfServiceChallengeStatus.EXPIRED } });
      return this.invalidChallenge();
    }
    const valid = this.crypto.matches(challenge.codeHash, this.crypto.hashOtp(challenge.id, code));
    if (!valid) {
      const attempts = challenge.attempts + 1;
      const locked = attempts >= challenge.maxAttempts;
      await this.prisma.selfServiceOtpChallenge.update({ where: { id: challenge.id }, data: { attempts, status: locked ? SelfServiceChallengeStatus.LOCKED : undefined, lockedAt: locked ? new Date() : undefined } });
      await this.audit(portal, "OTP_VERIFY", locked ? "LOCKED" : "INVALID", { challengeId: challenge.id, ipHash });
      return this.invalidChallenge();
    }
    const claim = await this.prisma.selfServiceOtpChallenge.updateMany({ where: { id: challenge.id, status: SelfServiceChallengeStatus.PENDING, verifiedAt: null }, data: { status: SelfServiceChallengeStatus.VERIFIED, verifiedAt: new Date() } });
    if (claim.count !== 1) return this.invalidChallenge();
    const subjectRef = this.crypto.decrypt(challenge.subjectRefEncrypted);
    const session = await this.sessions.create(challenge.id, portal, subjectRef, { ipAddress: context.ipAddress ?? null, userAgent: context.userAgent ?? null });
    await this.audit(portal, "OTP_VERIFY", "VERIFIED", { challengeId: challenge.id, sessionId: session.sessionId, ipHash, subjectHash: this.crypto.fingerprint(subjectRef) });
    return { status: "VERIFIED" as const, ...session, portal };
  }

  private async createLookupSession(
    portal: SelfServicePortal,
    lookupHash: string,
    subjectRef: string,
    context: RequestContext,
    ipHash: string,
  ) {
    const lookupId = randomUUID();
    const challengeId = randomUUID();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + LOOKUP_MINUTES * 60_000);
    const subjectRefEncrypted = this.crypto.encrypt(subjectRef);
    const browserBindingHash = this.browserBindingHash(context);

    await this.prisma.selfServiceAccessLookup.create({
      data: {
        id: lookupId,
        portal,
        lookupHash,
        subjectRefEncrypted,
        browserBindingHash,
        channels: [],
        destinationsEncrypted: this.crypto.encrypt("[]"),
        expiresAt,
      },
    });

    await this.prisma.selfServiceOtpChallenge.create({
      data: {
        id: challengeId,
        accessLookupId: lookupId,
        portal,
        lookupHash,
        subjectRefEncrypted,
        browserBindingHash,
        channel: "lookup",
        channelReference: "lookup",
        destinationMasked: "",
        codeHash: this.crypto.hashOtp(challengeId, randomUUID()),
        status: SelfServiceChallengeStatus.VERIFIED,
        attempts: 0,
        maxAttempts: 1,
        expiresAt,
        retryAvailableAt: now,
        verifiedAt: now,
      },
    });

    const session = await this.sessions.createLookup(challengeId, portal, subjectRef, {
      ipAddress: context.ipAddress ?? null,
      userAgent: context.userAgent ?? null,
    });
    await this.audit(portal, "LOOKUP_ACCESS", "VERIFIED", {
      challengeId,
      sessionId: session.sessionId,
      ipHash,
      subjectHash: this.crypto.fingerprint(subjectRef),
    });
    return { status: "VERIFIED" as const, ...session, portal };
  }

  private matchChannels(channels: readonly VerificationChannel[], destinations: readonly ContactDestination[]) {
    return channels.flatMap((channel) => {
      if (!channel.enabled || !channel.verified || !channel.operationalCommunicationPermission) return [];
      const destination = destinations.find((candidate) => candidate.id === channel.id && candidate.type === channel.type && candidate.enabled && candidate.verified && candidate.operationalCommunicationPermission);
      return destination ? [{ channel, destination }] : [];
    });
  }

  private readChannels(value: unknown): StoredChannel[] {
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is StoredChannel => {
      if (!item || typeof item !== "object") return false;
      const candidate = item as Record<string, unknown>;
      return typeof candidate.id === "string" && this.isChannel(candidate.type) && typeof candidate.masked === "string" &&
        typeof candidate.enabled === "boolean" && typeof candidate.verified === "boolean" &&
        (candidate.lastUpdatedAt === undefined || typeof candidate.lastUpdatedAt === "string") &&
        typeof candidate.operationalCommunicationPermission === "boolean";
    });
  }

  private readDestinations(encrypted: string): ContactDestination[] {
    try {
      const parsed: unknown = JSON.parse(this.crypto.decrypt(encrypted));
      if (!Array.isArray(parsed)) return [];
      return parsed.filter((item): item is ContactDestination => {
        if (!item || typeof item !== "object") return false;
        const candidate = item as Record<string, unknown>;
        return typeof candidate.id === "string" && this.isChannel(candidate.type) && typeof candidate.destination === "string" &&
          typeof candidate.enabled === "boolean" && typeof candidate.verified === "boolean" &&
          (candidate.lastUpdatedAt === undefined || typeof candidate.lastUpdatedAt === "string") &&
          typeof candidate.operationalCommunicationPermission === "boolean";
      });
    } catch {
      return [];
    }
  }

  private readChannel(value: string): SelfServiceChannel {
    if (!this.isChannel(value)) throw new HttpException({ message: "El desafío no es válido." }, HttpStatus.BAD_REQUEST);
    return value;
  }

  private isChannel(value: unknown): value is SelfServiceChannel {
    return value === "email" || value === "sms" || value === "whatsapp";
  }

  private challengeResponse(challengeId: string, channel: SelfServiceChannel, maskedDestination: string, expiresAt: Date, retryAfterSeconds: number) {
    return {
      status: "CHALLENGE_REQUIRED" as const,
      challengeId,
      channel,
      maskedDestination,
      expiresAt,
      retryAfterSeconds,
    };
  }

  private async enforceRateLimit(key: string, limit: number, windowSeconds: number) {
    const state = await this.limiter.checkAndIncrement(key, limit, windowSeconds);
    if (state.limited) {
      throw new HttpException(
        { message: "Demasiados intentos. Intenta más tarde.", retryAfterSeconds: state.retryAfterSeconds },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private ipHash(context: RequestContext) {
    return context.ipAddress ? this.crypto.fingerprint(context.ipAddress) : "unknown";
  }

  private browserBindingHash(context: RequestContext) {
    return this.crypto.fingerprint(`${context.ipAddress ?? "unknown"}|${context.userAgent ?? "unknown"}`);
  }

  private unavailable(code: string): SafeFailure {
    return { status: "UNAVAILABLE", error: { code, message: "No fue posible iniciar el acceso.", retryable: false } };
  }

  private invalidLookup(): SafeFailure {
    return { status: "UNAVAILABLE", error: { code: "INVALID_OR_EXPIRED_ACCESS", message: "No fue posible solicitar el código.", retryable: false } };
  }

  private invalidChallenge(): SafeFailure {
    return { status: "UNAVAILABLE", error: { code: "INVALID_OR_EXPIRED_CHALLENGE", message: "El código o desafío no es válido.", retryable: false } };
  }

  private async audit(portal: SelfServicePortal, action: string, outcome: string, input: { challengeId?: string; sessionId?: string; subjectHash?: string; ipHash?: string }) {
    await this.prisma.selfServiceAuditEvent.create({ data: { portal, action, outcome, challengeId: input.challengeId, sessionId: input.sessionId, subjectHash: input.subjectHash, ipHash: input.ipHash } });
  }
}
