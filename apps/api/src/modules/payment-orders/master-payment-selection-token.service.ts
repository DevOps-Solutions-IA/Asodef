import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { EnvConfig } from "../../config/env.validation";

const TOKEN_PREFIX = "master.v1.";
const AAD = Buffer.from("asodef:master-payment-selection:v1", "utf8");
const IV_BYTES = 12;
const AUTH_TAG_BYTES = 16;
const CLOCK_SKEW_MS = 60_000;

export interface MasterPaymentSelection {
  personId: string;
  contractId: string;
  installmentId: string;
}

interface MasterPaymentSelectionPayload extends MasterPaymentSelection {
  iat: number;
  exp: number;
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * Public /pagos must never expose the legacy contract/installment identifiers
 * directly. This service encrypts + authenticates the selection with AES-GCM
 * using a purpose-derived key from the application's existing ENCRYPTION_KEY.
 *
 * The token is only a short-lived selector. It is never proof that the amount
 * is still payable: the checkout path must decrypt it and re-read Master before
 * creating any payment state.
 */
@Injectable()
export class MasterPaymentSelectionTokenService {
  private readonly key: Buffer;
  private readonly ttlMs: number;

  constructor(config: ConfigService<EnvConfig, true>) {
    const encryptionKey = config.get("ENCRYPTION_KEY", { infer: true });
    this.key = createHash("sha256")
      .update("asodef/master-payment-selection/v1\0", "utf8")
      .update(encryptionKey, "utf8")
      .digest();
    this.ttlMs = config.get("PAYMENT_ORDER_TTL_MINUTES", { infer: true }) * 60_000;
  }

  issue(selection: MasterPaymentSelection): string {
    const now = Date.now();
    const payload: MasterPaymentSelectionPayload = {
      personId: selection.personId,
      contractId: selection.contractId,
      installmentId: selection.installmentId,
      iat: now,
      exp: now + this.ttlMs,
    };

    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv("aes-256-gcm", this.key, iv);
    cipher.setAAD(AAD);
    const ciphertext = Buffer.concat([
      cipher.update(JSON.stringify(payload), "utf8"),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();

    return `${TOKEN_PREFIX}${Buffer.concat([iv, authTag, ciphertext]).toString("base64url")}`;
  }

  verify(token: string): MasterPaymentSelection | null {
    if (!token.startsWith(TOKEN_PREFIX)) return null;

    try {
      const packed = Buffer.from(token.slice(TOKEN_PREFIX.length), "base64url");
      if (packed.length <= IV_BYTES + AUTH_TAG_BYTES) return null;

      const iv = packed.subarray(0, IV_BYTES);
      const authTag = packed.subarray(IV_BYTES, IV_BYTES + AUTH_TAG_BYTES);
      const ciphertext = packed.subarray(IV_BYTES + AUTH_TAG_BYTES);

      const decipher = createDecipheriv("aes-256-gcm", this.key, iv);
      decipher.setAAD(AAD);
      decipher.setAuthTag(authTag);
      const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
      const payload = JSON.parse(plaintext) as Partial<MasterPaymentSelectionPayload>;

      if (
        !nonEmptyString(payload.personId) ||
        !nonEmptyString(payload.contractId) ||
        !nonEmptyString(payload.installmentId) ||
        typeof payload.iat !== "number" ||
        typeof payload.exp !== "number"
      ) {
        return null;
      }

      const now = Date.now();
      if (payload.iat > now + CLOCK_SKEW_MS || payload.exp <= now || payload.exp <= payload.iat) {
        return null;
      }

      return {
        personId: payload.personId,
        contractId: payload.contractId,
        installmentId: payload.installmentId,
      };
    } catch {
      return null;
    }
  }
}
