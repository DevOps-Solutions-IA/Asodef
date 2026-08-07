import { HttpException, HttpStatus, Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { SelfServiceContactUpdateStatus, SelfServicePortal } from "@prisma/client";
import type { EnvConfig } from "../../config/env.validation";
import { PrismaService } from "../../database/prisma.service";
import type { RequestContext } from "../auth/auth.service";
import {
  EXTERNAL_CORE_PROVIDER,
  SELF_SERVICE_MESSAGE_PROVIDER,
  type ExternalCoreProvider,
  type ContactDestination,
  type ContactUpdateProviderState,
  type ProviderResult,
  type SelfServiceChannel,
  type SelfServiceMessageProvider,
} from "./external-core.provider";
import { SelfServiceCryptoService } from "./self-service-crypto.service";
import type { SelfServicePrincipal } from "./self-service-session.service";

type ContactUpdateResponse = Readonly<Record<string, string | number | boolean | null>>;

@Injectable()
export class SelfServiceContactUpdateService {
  private readonly otpMinutes: number;
  private readonly maxAttempts: number;
  private readonly cooldownSeconds: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: SelfServiceCryptoService,
    @Inject(EXTERNAL_CORE_PROVIDER) private readonly core: ExternalCoreProvider,
    @Inject(SELF_SERVICE_MESSAGE_PROVIDER) private readonly messages: SelfServiceMessageProvider,
    config: ConfigService<EnvConfig, true>,
  ) {
    this.otpMinutes = config.get("SELF_SERVICE_OTP_TTL_MINUTES", { infer: true });
    this.maxAttempts = config.get("SELF_SERVICE_OTP_MAX_ATTEMPTS", { infer: true });
    this.cooldownSeconds = config.get("SELF_SERVICE_OTP_COOLDOWN_SECONDS", { infer: true });
  }

  async start(principal: SelfServicePrincipal, channel: SelfServiceChannel, rawDestination: string, context: RequestContext): Promise<ProviderResult<ContactUpdateResponse>> {
    if (principal.portal !== SelfServicePortal.AFFILIATE || principal.assurance !== "OTP") return this.unavailable("CURRENT_CHANNEL_VERIFICATION_REQUIRED");
    const verifiedSession = await this.prisma.selfServiceSession.findFirst({
      where: {
        id: principal.sessionId,
        portal: SelfServicePortal.AFFILIATE,
        revokedAt: null,
        expiresAt: { gt: new Date() },
        challenge: { status: "VERIFIED" },
      },
      select: { id: true },
    });
    if (!verifiedSession) return this.unavailable("CURRENT_CHANNEL_VERIFICATION_REQUIRED");

    const destination = this.normalizeDestination(channel, rawDestination);
    if (!destination) throw new HttpException({ message: "El nuevo destino no tiene un formato válido para el canal seleccionado." }, HttpStatus.BAD_REQUEST);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.otpMinutes * 60_000);
    const request = await this.prisma.selfServiceContactUpdate.create({
      data: {
        sessionId: principal.sessionId,
        channel,
        destinationEncrypted: this.crypto.encrypt(destination),
        destinationMasked: this.maskDestination(channel, destination),
        browserBindingHash: this.browserBindingHash(context),
        maxAttempts: this.maxAttempts,
        expiresAt,
        retryAvailableAt: now,
      },
    });
    await this.audit(principal, "CONTACT_UPDATE_START", "DRAFT", request.id);
    return { status: "VERIFIED", data: this.response(request.id, request.status, channel, request.destinationMasked, expiresAt) };
  }

  async requestCode(principal: SelfServicePrincipal, requestId: string, context: RequestContext): Promise<ProviderResult<ContactUpdateResponse>> {
    const request = await this.findOwned(principal, requestId);
    const now = new Date();
    if (!request || !this.validBinding(request.browserBindingHash, context) || request.expiresAt <= now || (request.status !== SelfServiceContactUpdateStatus.DRAFT && request.status !== SelfServiceContactUpdateStatus.CHALLENGE_PENDING)) {
      return this.unavailable("INVALID_OR_EXPIRED_CONTACT_UPDATE");
    }
    if (request.status === SelfServiceContactUpdateStatus.CHALLENGE_PENDING && request.retryAvailableAt > now) {
      return { status: "VERIFIED", data: this.response(request.id, request.status, this.channel(request.channel), request.destinationMasked, request.expiresAt, Math.max(1, Math.ceil((request.retryAvailableAt.getTime() - now.getTime()) / 1000))) };
    }

    const reservedUntil = new Date(now.getTime() + this.cooldownSeconds * 1000);
    const reserved = await this.prisma.selfServiceContactUpdate.updateMany({
      where: { id: request.id, sessionId: principal.sessionId, status: request.status, retryAvailableAt: { lte: now } },
      data: { retryAvailableAt: reservedUntil },
    });
    if (reserved.count !== 1) return this.unavailable("CONTACT_UPDATE_RETRY_CONFLICT");

    const channel = this.channel(request.channel);
    const destination = this.crypto.decrypt(request.destinationEncrypted);
    const code = this.crypto.generateOtp();
    const delivered = await this.messages.deliverOtp({ channel, destination, code, expiresInMinutes: this.otpMinutes });
    if (delivered.status !== "VERIFIED") {
      await this.prisma.selfServiceContactUpdate.update({ where: { id: request.id }, data: { retryAvailableAt: now } });
      await this.audit(principal, "CONTACT_UPDATE_OTP", delivered.status, request.id);
      return delivered;
    }

    const expiresAt = new Date(now.getTime() + this.otpMinutes * 60_000);
    await this.prisma.selfServiceContactUpdate.update({
      where: { id: request.id },
      data: {
        codeHash: this.crypto.hashOtp(request.id, code),
        status: SelfServiceContactUpdateStatus.CHALLENGE_PENDING,
        attempts: 0,
        expiresAt,
        retryAvailableAt: reservedUntil,
      },
    });
    await this.audit(principal, "CONTACT_UPDATE_OTP", "CHALLENGE_PENDING", request.id);
    return { status: "VERIFIED", data: this.response(request.id, SelfServiceContactUpdateStatus.CHALLENGE_PENDING, channel, request.destinationMasked, expiresAt, this.cooldownSeconds) };
  }

  async verify(principal: SelfServicePrincipal, requestId: string, code: string, idempotencyKey: string, context: RequestContext): Promise<ProviderResult<ContactUpdateResponse>> {
    let request = await this.findOwned(principal, requestId);
    if (!request || !this.validBinding(request.browserBindingHash, context)) return this.unavailable("INVALID_OR_EXPIRED_CONTACT_UPDATE");

    if (request.status === SelfServiceContactUpdateStatus.CHALLENGE_PENDING) {
      if (request.expiresAt <= new Date() || !request.codeHash) return this.unavailable("INVALID_OR_EXPIRED_CONTACT_UPDATE");
      if (!this.crypto.matches(request.codeHash, this.crypto.hashOtp(request.id, code))) {
        const attempts = request.attempts + 1;
        const locked = attempts >= request.maxAttempts;
        await this.prisma.selfServiceContactUpdate.update({ where: { id: request.id }, data: { attempts, status: locked ? SelfServiceContactUpdateStatus.LOCKED : undefined } });
        await this.audit(principal, "CONTACT_UPDATE_VERIFY", locked ? "LOCKED" : "INVALID", request.id);
        return this.unavailable("INVALID_OR_EXPIRED_CONTACT_UPDATE");
      }
      const claimed = await this.prisma.selfServiceContactUpdate.updateMany({
        where: { id: request.id, sessionId: principal.sessionId, status: SelfServiceContactUpdateStatus.CHALLENGE_PENDING, verifiedAt: null },
        data: { status: SelfServiceContactUpdateStatus.VERIFIED, verifiedAt: new Date(), codeHash: null },
      });
      if (claimed.count !== 1) return this.unavailable("CONTACT_UPDATE_VERIFY_CONFLICT");
      await this.audit(principal, "CONTACT_UPDATE_VERIFY", "VERIFIED", request.id);
      request = { ...request, status: SelfServiceContactUpdateStatus.VERIFIED, codeHash: null };
    }

    if (request.status === SelfServiceContactUpdateStatus.APPLIED || request.status === SelfServiceContactUpdateStatus.SUBMITTED || request.status === SelfServiceContactUpdateStatus.REJECTED) {
      return { status: "VERIFIED", data: this.response(request.id, request.status, this.channel(request.channel), request.destinationMasked, request.expiresAt, undefined, request.providerReference) };
    }
    if (request.status !== SelfServiceContactUpdateStatus.VERIFIED) return this.unavailable("CONTACT_UPDATE_NOT_VERIFIED");

    const destination = this.crypto.decrypt(request.destinationEncrypted);
    const submitted = await this.core.submitAffiliateContactUpdate(
      principal.subjectRef,
      { channel: this.channel(request.channel), destination, verificationReference: request.id },
      idempotencyKey,
    );
    if (submitted.status !== "VERIFIED") {
      await this.audit(principal, "CONTACT_UPDATE_PROVIDER_SUBMIT", submitted.status, request.id);
      return submitted;
    }
    const status = this.localProviderStatus(submitted.data.status);
    const updated = await this.prisma.selfServiceContactUpdate.update({
      where: { id: request.id },
      data: {
        status,
        providerReference: submitted.data.providerReference,
        appliedAt: status === SelfServiceContactUpdateStatus.APPLIED ? new Date() : null,
      },
    });
    await this.audit(principal, "CONTACT_UPDATE_PROVIDER_SUBMIT", status, request.id);
    if (status === SelfServiceContactUpdateStatus.APPLIED) await this.notifyApplied(principal, request.id, this.channel(request.channel), destination, submitted.data.notificationPermissions);
    return { status: "VERIFIED", data: this.response(updated.id, updated.status, this.channel(updated.channel), updated.destinationMasked, updated.expiresAt, undefined, updated.providerReference) };
  }

  async status(principal: SelfServicePrincipal, requestId: string): Promise<ProviderResult<ContactUpdateResponse>> {
    const request = await this.findOwned(principal, requestId);
    if (!request) return this.unavailable("INVALID_CONTACT_UPDATE");
    let status = request.status;
    if (request.providerReference && request.status === SelfServiceContactUpdateStatus.SUBMITTED) {
      try {
        const provider = await this.core.getAffiliateContactUpdate(principal.subjectRef, request.providerReference);
        if (provider.status === "VERIFIED") {
          status = this.localProviderStatus(provider.data.status);
          if (status !== request.status) {
            await this.prisma.selfServiceContactUpdate.update({ where: { id: request.id }, data: { status, appliedAt: status === SelfServiceContactUpdateStatus.APPLIED ? new Date() : null } });
            await this.audit(principal, "CONTACT_UPDATE_PROVIDER_STATUS", status, request.id);
            if (status === SelfServiceContactUpdateStatus.APPLIED) await this.notifyApplied(principal, request.id, this.channel(request.channel), this.crypto.decrypt(request.destinationEncrypted), provider.data.notificationPermissions);
          }
        } else {
          await this.audit(principal, "CONTACT_UPDATE_PROVIDER_STATUS", provider.status, request.id);
        }
      } catch {
        await this.audit(principal, "CONTACT_UPDATE_PROVIDER_STATUS", "UNAVAILABLE", request.id);
      }
    }
    return { status: "VERIFIED", data: this.response(request.id, status, this.channel(request.channel), request.destinationMasked, request.expiresAt, undefined, request.providerReference) };
  }

  private findOwned(principal: SelfServicePrincipal, requestId: string) {
    if (principal.portal !== SelfServicePortal.AFFILIATE || principal.assurance !== "OTP") return Promise.resolve(null);
    return this.prisma.selfServiceContactUpdate.findFirst({ where: { id: requestId, sessionId: principal.sessionId } });
  }

  private normalizeDestination(channel: SelfServiceChannel, value: string): string | null {
    const normalized = value.trim();
    if (channel === "email") return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) ? normalized.toLowerCase() : null;
    return /^\+[1-9]\d{7,14}$/.test(normalized) ? normalized : null;
  }

  private maskDestination(channel: SelfServiceChannel, value: string): string {
    if (channel === "email") {
      const [local, domain] = value.split("@");
      return `${local?.slice(0, 1) ?? "*"}***@${domain}`;
    }
    return `***${value.slice(-4)}`;
  }

  private browserBindingHash(context: RequestContext): string {
    return this.crypto.fingerprint(`${context.ipAddress ?? "unknown"}|${context.userAgent ?? "unknown"}`);
  }

  private validBinding(expected: string, context: RequestContext): boolean {
    return this.crypto.matches(expected, this.browserBindingHash(context));
  }

  private channel(value: string): SelfServiceChannel {
    if (value === "email" || value === "sms" || value === "whatsapp") return value;
    throw new HttpException({ message: "El canal registrado no es válido." }, HttpStatus.BAD_REQUEST);
  }

  private localProviderStatus(status: "PENDING" | "APPLIED" | "REJECTED"): SelfServiceContactUpdateStatus {
    if (status === "APPLIED") return SelfServiceContactUpdateStatus.APPLIED;
    if (status === "REJECTED") return SelfServiceContactUpdateStatus.REJECTED;
    return SelfServiceContactUpdateStatus.SUBMITTED;
  }

  private response(requestId: string, status: SelfServiceContactUpdateStatus, channel: SelfServiceChannel, maskedDestination: string, expiresAt: Date, retryAfterSeconds?: number, providerReference?: string | null): ContactUpdateResponse {
    return {
      requestId,
      status,
      channel,
      maskedDestination,
      expiresAt: expiresAt.toISOString(),
      ...(retryAfterSeconds === undefined ? {} : { retryAfterSeconds }),
      ...(providerReference ? { providerReference } : {}),
    };
  }

  private unavailable(code: string): ProviderResult<never> {
    return { status: "UNAVAILABLE", error: { code, message: "No fue posible completar la actualización del canal.", retryable: false } };
  }

  private async notifyApplied(principal: SelfServicePrincipal, requestId: string, channel: SelfServiceChannel, destination: string, permissions: ContactUpdateProviderState["notificationPermissions"]) {
    if (!permissions) {
      await this.audit(principal, "CONTACT_UPDATE_NOTIFICATION", "SKIPPED_PERMISSION_NOT_CONFIRMED", requestId);
      return;
    }
    const targets: Array<{ channel: SelfServiceChannel; destination: string; audience: "PREVIOUS_DESTINATION" | "NEW_DESTINATION" }> = [];
    if (permissions.newDestination) targets.push({ channel, destination, audience: "NEW_DESTINATION" });
    if (permissions.previousDestination) {
      const previous = await this.previousDestination(principal.sessionId);
      if (previous) targets.push({ ...previous, audience: "PREVIOUS_DESTINATION" });
    }
    if (targets.length === 0) {
      await this.audit(principal, "CONTACT_UPDATE_NOTIFICATION", "SKIPPED_PERMISSION_NOT_CONFIRMED", requestId);
      return;
    }
    for (const target of targets) {
      try {
        const notified = await this.messages.notifyContactUpdated({ ...target, purpose: "CONTACT_UPDATE_CONFIRMATION" });
        await this.audit(principal, `CONTACT_UPDATE_NOTIFICATION_${target.audience}`, notified.status, requestId);
      } catch {
        await this.audit(principal, `CONTACT_UPDATE_NOTIFICATION_${target.audience}`, "UNAVAILABLE", requestId);
      }
    }
  }

  private async previousDestination(sessionId: string): Promise<{ channel: SelfServiceChannel; destination: string } | null> {
    const session = await this.prisma.selfServiceSession.findUnique({
      where: { id: sessionId },
      include: { challenge: { include: { accessLookup: true } } },
    });
    if (!session) return null;
    const storedChannels = session.challenge.accessLookup.channels;
    if (!Array.isArray(storedChannels)) return null;
    const channelPermission = storedChannels.some((item) => {
      if (!item || typeof item !== "object") return false;
      const candidate = item as Record<string, unknown>;
      return candidate.id === session.challenge.channelReference && candidate.operationalCommunicationPermission === true;
    });
    if (!channelPermission) return null;
    try {
      const parsed: unknown = JSON.parse(this.crypto.decrypt(session.challenge.accessLookup.destinationsEncrypted));
      if (!Array.isArray(parsed)) return null;
      const destination = parsed.find((item): item is ContactDestination => {
        if (!item || typeof item !== "object") return false;
        const candidate = item as Record<string, unknown>;
        return candidate.id === session.challenge.channelReference && candidate.type === session.challenge.channel &&
          typeof candidate.destination === "string" && candidate.operationalCommunicationPermission === true;
      });
      return destination ? { channel: this.channel(destination.type), destination: destination.destination } : null;
    } catch {
      return null;
    }
  }

  private async audit(principal: SelfServicePrincipal, action: string, outcome: string, requestId: string) {
    await this.prisma.selfServiceAuditEvent.create({ data: {
      portal: principal.portal,
      action,
      outcome,
      sessionId: principal.sessionId,
      subjectHash: this.crypto.fingerprint(principal.subjectRef),
      metadata: { requestHash: this.crypto.hash(requestId) },
    } });
  }
}
