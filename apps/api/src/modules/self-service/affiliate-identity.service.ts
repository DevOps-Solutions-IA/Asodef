import { randomUUID } from "node:crypto";
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AffiliateExternalIdentityStatus, Prisma } from "@prisma/client";
import type { EnvConfig } from "../../config/env.validation";
import { PrismaService } from "../../database/prisma.service";
import {
  ExternalIdentityFingerprintService,
  type VersionedIdentityFingerprint,
} from "./external-identity-fingerprint.service";

export interface ResolvedAffiliateIdentity {
  identityId: string;
  affiliateId: string;
  issuer: string;
  verifiedAt: Date;
  fingerprintKeyId: string;
}

type TransactionClient = Prisma.TransactionClient;

@Injectable()
export class AffiliateIdentityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<EnvConfig, true>,
    private readonly fingerprintService: ExternalIdentityFingerprintService,
  ) {}

  async resolveSubject(subjectRef: string): Promise<ResolvedAffiliateIdentity> {
    this.assertValidSubjectRef(subjectRef);
    const issuer = this.configuredIssuer();
    const fingerprints = this.fingerprintService.fingerprints(subjectRef);
    const activeFingerprint = this.activeFingerprint(fingerprints);

    return this.serializable(async (transaction) => {
      const matches = await this.findMatches(transaction, issuer, fingerprints);
      const activeMatches = matches.filter(
        ({ identity, retiredAt }) =>
          identity.status === AffiliateExternalIdentityStatus.ACTIVE && !retiredAt,
      );
      const identityIds = new Set(activeMatches.map(({ identityId }) => identityId));
      if (identityIds.size !== 1) {
        throw new UnauthorizedException(
          "No fue posible validar la identidad del afiliado.",
        );
      }

      const match = activeMatches.find(({ keyId }) => keyId === activeFingerprint.keyId) ?? activeMatches[0];
      if (!match) throw new UnauthorizedException("No fue posible validar la identidad del afiliado.");
      await this.lockIdentity(transaction, match.identityId);
      await this.ensureFingerprints(transaction, match.identityId, issuer, fingerprints);
      const lastVerifiedAt = new Date();
      const identity = await transaction.affiliateExternalIdentity.update({
        where: { id: match.identityId },
        data: { lastVerifiedAt },
        select: { id: true, affiliateId: true, issuer: true, verifiedAt: true },
      });
      await transaction.affiliateExternalIdentityFingerprint.update({
        where: { id: match.id },
        data: { lastUsedAt: lastVerifiedAt },
      });
      return {
        identityId: identity.id,
        affiliateId: identity.affiliateId,
        issuer: identity.issuer,
        verifiedAt: identity.verifiedAt,
        fingerprintKeyId: match.keyId,
      };
    });
  }

  /** Trusted provisioning operation; intentionally not exposed by a controller. */
  async linkVerifiedSubject(
    affiliateId: string,
    subjectRef: string,
  ): Promise<ResolvedAffiliateIdentity> {
    this.assertValidSubjectRef(subjectRef);
    const issuer = this.configuredIssuer();
    const fingerprints = this.fingerprintService.fingerprints(subjectRef);
    const activeFingerprint = this.activeFingerprint(fingerprints);

    return this.serializable(async (transaction) => {
      await this.lockAffiliate(transaction, affiliateId);
      const matches = await this.findMatches(transaction, issuer, fingerprints);
      if (matches.some(({ identity }) => identity.affiliateId !== affiliateId)) {
        throw this.mappingConflict();
      }

      const active = await transaction.affiliateExternalIdentity.findFirst({
        where: { affiliateId, issuer, status: AffiliateExternalIdentityStatus.ACTIVE },
      });
      if (active) {
        if (!matches.some(({ identityId }) => identityId === active.id)) {
          throw this.mappingConflict();
        }
        await this.ensureFingerprints(transaction, active.id, issuer, fingerprints);
        return this.touchIdentity(transaction, active.id, activeFingerprint.keyId);
      }
      if (matches.length > 0) {
        // Historical subjects are never silently reactivated.
        throw this.mappingConflict();
      }

      const verifiedAt = new Date();
      const identity = await transaction.affiliateExternalIdentity.create({
        data: {
          affiliateId,
          issuer,
          verifiedAt,
          lastVerifiedAt: verifiedAt,
          fingerprints: {
            create: fingerprints.map(({ keyId, subjectRefHash }) => ({
              keyId,
              subjectRefHash,
            })),
          },
        },
        select: { id: true, affiliateId: true, issuer: true, verifiedAt: true },
      });
      return {
        identityId: identity.id,
        affiliateId: identity.affiliateId,
        issuer: identity.issuer,
        verifiedAt: identity.verifiedAt,
        fingerprintKeyId: activeFingerprint.keyId,
      };
    });
  }

  async replaceVerifiedSubject(
    affiliateId: string,
    identityId: string,
    newSubjectRef: string,
  ): Promise<ResolvedAffiliateIdentity> {
    this.assertValidSubjectRef(newSubjectRef);
    const issuer = this.configuredIssuer();
    const fingerprints = this.fingerprintService.fingerprints(newSubjectRef);
    const activeFingerprint = this.activeFingerprint(fingerprints);

    return this.serializable(async (transaction) => {
      await this.lockAffiliate(transaction, affiliateId);
      const current = await transaction.affiliateExternalIdentity.findFirst({
        where: { id: identityId, affiliateId, issuer },
      });
      if (!current) throw new NotFoundException("La identidad externa no existe.");

      const matches = await this.findMatches(transaction, issuer, fingerprints);
      if (current.status === AffiliateExternalIdentityStatus.REPLACED) {
        if (matches.some(({ identityId: matchId }) => matchId === current.replacedByIdentityId)) {
          return this.touchIdentity(
            transaction,
            current.replacedByIdentityId!,
            activeFingerprint.keyId,
          );
        }
        throw this.mappingConflict();
      }
      if (current.status !== AffiliateExternalIdentityStatus.ACTIVE) {
        throw this.mappingConflict();
      }
      if (matches.some(({ identityId: matchId }) => matchId === current.id)) {
        return this.touchIdentity(transaction, current.id, activeFingerprint.keyId);
      }
      if (matches.length > 0) throw this.mappingConflict();

      const now = new Date();
      const replacementId = randomUUID();
      // The temporary REVOKED state satisfies every database invariant while
      // the replacement chain is built inside this invisible transaction.
      await transaction.affiliateExternalIdentity.create({
        data: {
          id: replacementId,
          affiliateId,
          issuer,
          status: AffiliateExternalIdentityStatus.REVOKED,
          verifiedAt: now,
          lastVerifiedAt: now,
          deactivatedAt: now,
          fingerprints: {
            create: fingerprints.map(({ keyId, subjectRefHash }) => ({
              keyId,
              subjectRefHash,
            })),
          },
        },
      });
      await transaction.affiliateExternalIdentity.update({
        where: { id: current.id },
        data: {
          status: AffiliateExternalIdentityStatus.REPLACED,
          deactivatedAt: now,
          replacedByIdentityId: replacementId,
        },
      });
      await transaction.affiliateExternalIdentity.update({
        where: { id: replacementId },
        data: { status: AffiliateExternalIdentityStatus.ACTIVE, deactivatedAt: null },
      });
      return this.touchIdentity(transaction, replacementId, activeFingerprint.keyId);
    });
  }

  async revokeIdentity(affiliateId: string, identityId: string): Promise<void> {
    const issuer = this.configuredIssuer();
    await this.serializable(async (transaction) => {
      await this.lockAffiliate(transaction, affiliateId);
      const identity = await transaction.affiliateExternalIdentity.findFirst({
        where: { id: identityId, affiliateId, issuer },
      });
      if (!identity) throw new NotFoundException("La identidad externa no existe.");
      if (identity.status === AffiliateExternalIdentityStatus.REVOKED) return;
      if (identity.status !== AffiliateExternalIdentityStatus.ACTIVE) {
        throw this.mappingConflict();
      }
      await transaction.affiliateExternalIdentity.update({
        where: { id: identity.id },
        data: { status: AffiliateExternalIdentityStatus.REVOKED, deactivatedAt: new Date() },
      });
    });
  }

  private async findMatches(
    transaction: TransactionClient,
    issuer: string,
    fingerprints: VersionedIdentityFingerprint[],
  ) {
    return transaction.affiliateExternalIdentityFingerprint.findMany({
      where: {
        issuer,
        OR: fingerprints.map(({ keyId, subjectRefHash }) => ({ keyId, subjectRefHash })),
      },
      include: { identity: true },
    });
  }

  private activeFingerprint(
    fingerprints: VersionedIdentityFingerprint[],
  ): VersionedIdentityFingerprint {
    const active = fingerprints.find(({ active }) => active);
    if (!active) {
      throw new ServiceUnavailableException(
        "La huella de identidad externa no está configurada.",
      );
    }
    return active;
  }

  private async ensureFingerprints(
    transaction: TransactionClient,
    identityId: string,
    issuer: string,
    fingerprints: VersionedIdentityFingerprint[],
  ): Promise<void> {
    for (const { keyId, subjectRefHash } of fingerprints) {
      await transaction.affiliateExternalIdentityFingerprint.upsert({
        where: { identityId_keyId: { identityId, keyId } },
        create: { identityId, issuer, keyId, subjectRefHash },
        update: {},
      });
    }
  }

  private async touchIdentity(
    transaction: TransactionClient,
    identityId: string,
    fingerprintKeyId: string,
  ): Promise<ResolvedAffiliateIdentity> {
    const identity = await transaction.affiliateExternalIdentity.update({
      where: { id: identityId },
      data: { lastVerifiedAt: new Date() },
      select: { id: true, affiliateId: true, issuer: true, verifiedAt: true },
    });
    return { ...identity, identityId: identity.id, fingerprintKeyId };
  }

  private async lockAffiliate(transaction: TransactionClient, affiliateId: string): Promise<void> {
    const rows = await transaction.$queryRaw<{ id: string }[]>`
      SELECT id FROM affiliates WHERE id = ${affiliateId}::uuid FOR UPDATE
    `;
    if (rows.length === 0) throw new NotFoundException("El afiliado no existe.");
  }

  private async lockIdentity(transaction: TransactionClient, identityId: string): Promise<void> {
    await transaction.$queryRaw`
      SELECT id FROM affiliate_external_identities WHERE id = ${identityId}::uuid FOR UPDATE
    `;
  }

  private async serializable<T>(operation: (transaction: TransactionClient) => Promise<T>): Promise<T> {
    const maxAttempts = 8;
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      try {
        return await this.prisma.$transaction(operation, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError) {
          if (error.code === "P2034" && attempt < maxAttempts - 1) continue;
          if (error.code === "P2002" && attempt === 0) continue;
          if (error.code === "P2002" || error.code === "P2034") {
            throw this.mappingConflict();
          }
        }
        throw error;
      }
    }
    throw this.mappingConflict();
  }

  private configuredIssuer(): string {
    const provider = this.config.get("EXTERNAL_CORE_PROVIDER", { infer: true });
    const issuer = this.config.get("EXTERNAL_CORE_IDENTITY_ISSUER", { infer: true });
    if (provider === "not_configured" || !issuer) {
      throw new ServiceUnavailableException(
        "La validación de identidad externa no está disponible.",
      );
    }
    return issuer;
  }

  private assertValidSubjectRef(subjectRef: string): void {
    if (
      typeof subjectRef !== "string" ||
      subjectRef.trim().length === 0 ||
      subjectRef.length > 512
    ) {
      throw new BadRequestException("La referencia de identidad externa no es válida.");
    }
  }

  private mappingConflict(): ConflictException {
    return new ConflictException("La identidad externa ya tiene un vínculo diferente.");
  }
}
