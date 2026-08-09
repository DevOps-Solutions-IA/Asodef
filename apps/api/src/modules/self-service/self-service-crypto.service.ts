import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import type { EnvConfig } from "../../config/env.validation";

@Injectable()
export class SelfServiceCryptoService {
  private readonly key: Buffer;
  private readonly externalIdentityKey: Buffer;

  constructor(config: ConfigService<EnvConfig, true>) {
    const encryptionKey = config.get("ENCRYPTION_KEY", { infer: true });
    this.key = createHash("sha256").update(encryptionKey).digest();
    const configuredIdentityKey = config.get("EXTERNAL_IDENTITY_HMAC_KEY", { infer: true });
    // In fail-closed/not-configured environments the fallback keeps tests and
    // existing self-service boot compatible. HTTP mode requires a dedicated
    // key through env.validation and can never reach production with fallback.
    this.externalIdentityKey = createHash("sha256").update(configuredIdentityKey || encryptionKey).digest();
  }

  generateToken(): string { return randomBytes(32).toString("base64url"); }
  generateOtp(): string { return randomInt(0, 1_000_000).toString().padStart(6, "0"); }
  hash(value: string): string { return createHash("sha256").update(value).digest("hex"); }
  fingerprint(value: string): string { return createHmac("sha256", this.key).update(value.trim().toLowerCase()).digest("hex"); }
  fingerprintOpaque(value: string): string { return createHmac("sha256", this.externalIdentityKey).update(value).digest("hex"); }
  hashOtp(challengeId: string, code: string): string { return createHmac("sha256", this.key).update(`${challengeId}:${code}`).digest("hex"); }

  matches(expectedHex: string, actualHex: string): boolean {
    const expected = Buffer.from(expectedHex, "hex");
    const actual = Buffer.from(actualHex, "hex");
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  }

  encrypt(value: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key, iv);
    const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
    return `${iv.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}.${ciphertext.toString("base64url")}`;
  }

  decrypt(value: string): string {
    const [iv, tag, ciphertext] = value.split(".");
    if (!iv || !tag || !ciphertext) throw new Error("Invalid encrypted self-service value");
    const decipher = createDecipheriv("aes-256-gcm", this.key, Buffer.from(iv, "base64url"));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64url")), decipher.final()]).toString("utf8");
  }
}
