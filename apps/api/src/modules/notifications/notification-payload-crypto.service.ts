import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import type { EnvConfig } from "../../config/env.validation";

/**
 * Encrypts durable notification payloads with an outbox-specific derived key.
 * The envelope deliberately contains no key identifier or configuration value.
 */
@Injectable()
export class NotificationPayloadCryptoService {
  private readonly key: Buffer;

  constructor(config: ConfigService<EnvConfig, true>) {
    this.key = createHash("sha256")
      .update("asodef:notification-outbox:v1:")
      .update(config.get("ENCRYPTION_KEY", { infer: true }))
      .digest();
  }

  encrypt(value: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key, iv);
    const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
    return `${iv.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}.${ciphertext.toString("base64url")}`;
  }

  decrypt(value: string): string {
    const [iv, tag, ciphertext] = value.split(".");
    if (!iv || !tag || !ciphertext) throw new Error("INVALID_NOTIFICATION_PAYLOAD");
    const decipher = createDecipheriv("aes-256-gcm", this.key, Buffer.from(iv, "base64url"));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64url")), decipher.final()]).toString("utf8");
  }
}
