import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { EnvConfig } from "../../../config/env.validation";

/** Authenticated encryption for the TOTP seed at rest. The existing
 * application ENCRYPTION_KEY is domain-separated before use so ciphertext
 * from another bounded context cannot be transplanted into MFA. */
@Injectable()
export class MfaSecretProtectorService {
  private readonly key: Buffer;

  constructor(config: ConfigService<EnvConfig, true>) {
    this.key = createHash("sha256")
      .update("asodef:admin-mfa:v1\0", "utf8")
      .update(config.get("ENCRYPTION_KEY", { infer: true }), "utf8")
      .digest();
  }

  encrypt(secret: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key, iv);
    const ciphertext = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
    return `v1.${iv.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}.${ciphertext.toString("base64url")}`;
  }

  decrypt(value: string): string {
    const [version, iv, tag, ciphertext] = value.split(".");
    if (version !== "v1" || !iv || !tag || !ciphertext) throw new Error("Invalid encrypted MFA secret");
    const decipher = createDecipheriv("aes-256-gcm", this.key, Buffer.from(iv, "base64url"));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64url")), decipher.final()]).toString("utf8");
  }
}
