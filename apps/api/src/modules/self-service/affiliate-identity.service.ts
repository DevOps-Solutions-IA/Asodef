import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Prisma } from "@prisma/client";
import type { EnvConfig } from "../../config/env.validation";
import { PrismaService } from "../../database/prisma.service";
import { SelfServiceCryptoService } from "./self-service-crypto.service";

export interface ResolvedAffiliateIdentity {
  affiliateId: string;
  issuer: string;
  verifiedAt: Date;
}

@Injectable()
export class AffiliateIdentityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<EnvConfig, true>,
    private readonly crypto: SelfServiceCryptoService,
  ) {}

  async resolveSubject(subjectRef: string): Promise<ResolvedAffiliateIdentity> {
    this.assertValidSubjectRef(subjectRef);
    const issuer = this.configuredIssuer();
    const subjectRefHash = this.crypto.fingerprintOpaque(subjectRef);
    const identity = await this.prisma.affiliateExternalIdentity.findUnique({
      where: { issuer_subjectRefHash: { issuer, subjectRefHash } },
      select: { affiliateId: true, issuer: true, verifiedAt: true },
    });

    if (!identity) {
      throw new UnauthorizedException(
        "No fue posible validar la identidad del afiliado.",
      );
    }
    return identity;
  }

  /**
   * Internal provisioning operation. It is intentionally not exposed by a
   * controller: only a trusted external-core verification workflow may call
   * it. Database uniqueness prevents silent remapping in concurrent requests.
   */
  async linkVerifiedSubject(
    affiliateId: string,
    subjectRef: string,
  ): Promise<ResolvedAffiliateIdentity> {
    this.assertValidSubjectRef(subjectRef);
    const issuer = this.configuredIssuer();
    const subjectRefHash = this.crypto.fingerprintOpaque(subjectRef);
    const verifiedAt = new Date();

    try {
      return await this.prisma.$transaction(async (transaction) => {
        const affiliate = await transaction.affiliate.findUnique({
          where: { id: affiliateId },
          select: { id: true },
        });
        if (!affiliate) throw new NotFoundException("El afiliado no existe.");

        const bySubject =
          await transaction.affiliateExternalIdentity.findUnique({
            where: { issuer_subjectRefHash: { issuer, subjectRefHash } },
          });
        if (bySubject) {
          if (bySubject.affiliateId !== affiliateId)
            throw this.mappingConflict();
          return transaction.affiliateExternalIdentity.update({
            where: { id: bySubject.id },
            data: { lastVerifiedAt: verifiedAt },
            select: { affiliateId: true, issuer: true, verifiedAt: true },
          });
        }

        const byAffiliate =
          await transaction.affiliateExternalIdentity.findUnique({
            where: { issuer_affiliateId: { issuer, affiliateId } },
            select: { subjectRefHash: true },
          });
        if (byAffiliate) throw this.mappingConflict();

        return transaction.affiliateExternalIdentity.create({
          data: {
            affiliateId,
            issuer,
            subjectRefHash,
            verifiedAt,
            lastVerifiedAt: verifiedAt,
          },
          select: { affiliateId: true, issuer: true, verifiedAt: true },
        });
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        const concurrentIdentity =
          await this.prisma.affiliateExternalIdentity.findUnique({
            where: { issuer_subjectRefHash: { issuer, subjectRefHash } },
            select: { affiliateId: true, issuer: true, verifiedAt: true },
          });
        if (concurrentIdentity?.affiliateId === affiliateId)
          return concurrentIdentity;
        throw this.mappingConflict();
      }
      throw error;
    }
  }

  private configuredIssuer(): string {
    const provider = this.config.get("EXTERNAL_CORE_PROVIDER", { infer: true });
    const issuer = this.config.get("EXTERNAL_CORE_IDENTITY_ISSUER", {
      infer: true,
    });
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
      throw new BadRequestException(
        "La referencia de identidad externa no es válida.",
      );
    }
  }

  private mappingConflict(): ConflictException {
    return new ConflictException(
      "La identidad externa ya tiene un vínculo diferente.",
    );
  }
}
