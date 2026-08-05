import { randomBytes, createHmac } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { ContractDownloadToken } from "@prisma/client";
import { PrismaService } from "../../database/prisma.service";
import type { EnvConfig } from "../../config/env.validation";

/**
 * US-055: mirrors PasswordResetTokenService's exact security pattern -
 * a 256-bit random raw token, only its HMAC-SHA256 hash (keyed with a
 * dedicated CONTRACT_DOWNLOAD_TOKEN_SECRET pepper) is ever persisted.
 * Reusable (not single-use) within its TTL window, matching standard
 * signed-URL semantics.
 */
@Injectable()
export class ContractDownloadTokenService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService<EnvConfig, true>,
  ) {}

  generateToken(): string {
    return randomBytes(32).toString("base64url");
  }

  hashToken(rawToken: string): string {
    const pepper = this.configService.get("CONTRACT_DOWNLOAD_TOKEN_SECRET", { infer: true });
    return createHmac("sha256", pepper).update(rawToken).digest("hex");
  }

  async createToken(contractVersionId: string, issuedByUserId: string): Promise<{ token: ContractDownloadToken; rawToken: string }> {
    const ttlMinutes = this.configService.get("CONTRACT_DOWNLOAD_URL_TTL_MINUTES", { infer: true });
    const rawToken = this.generateToken();
    const token = await this.prisma.contractDownloadToken.create({
      data: {
        contractVersionId,
        tokenHash: this.hashToken(rawToken),
        issuedByUserId,
        expiresAt: new Date(Date.now() + ttlMinutes * 60_000),
      },
    });
    return { token, rawToken };
  }

  async findByRawToken(rawToken: string): Promise<ContractDownloadToken | null> {
    return this.prisma.contractDownloadToken.findUnique({ where: { tokenHash: this.hashToken(rawToken) } });
  }

  isExpired(token: ContractDownloadToken): boolean {
    return token.expiresAt.getTime() <= Date.now();
  }
}
