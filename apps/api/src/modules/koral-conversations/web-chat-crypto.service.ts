import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { BadRequestException, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { EnvConfig } from "../../config/env.validation";

interface CursorPayload {
  v: 1;
  sessionId: string;
  occurredAt: string;
  messageId: string;
  expiresAt: string;
}

@Injectable()
export class WebChatCryptoService {
  private readonly key: string;

  constructor(config: ConfigService<EnvConfig, true>) {
    this.key = config.get("ENCRYPTION_KEY", { infer: true });
  }

  issueToken(): string {
    return randomBytes(32).toString("base64url");
  }

  tokenDigest(rawToken: string): string {
    return this.sign("session", rawToken);
  }

  rateLimitDigest(value: string): string {
    return this.sign("rate-limit", value);
  }

  publicMessageId(sessionId: string, messageId: string): string {
    const hex = this.sign("public-message", `${sessionId}:${messageId}`).slice(0, 32).split("");
    hex[12] = "4";
    hex[16] = "8";
    const compact = hex.join("");
    return `${compact.slice(0, 8)}-${compact.slice(8, 12)}-${compact.slice(12, 16)}-${compact.slice(16, 20)}-${compact.slice(20)}`;
  }

  encodeCursor(payload: Omit<CursorPayload, "v" | "expiresAt">, now = new Date()): string {
    const plaintext = Buffer.from(JSON.stringify({
      v: 1,
      ...payload,
      expiresAt: new Date(now.getTime() + 15 * 60 * 1_000).toISOString(),
    } satisfies CursorPayload), "utf8");
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.cursorEncryptionKey(), iv);
    cipher.setAAD(Buffer.from("asodef:koral:web-chat:cursor:v1", "utf8"));
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const envelope = `${iv.toString("base64url")}.${ciphertext.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}`;
    return `${envelope}.${this.sign("cursor", envelope)}`;
  }

  decodeCursor(value: string, expectedSessionId: string, now = new Date()): CursorPayload {
    const [ivEncoded, ciphertextEncoded, tagEncoded, signature, extra] = value.split(".");
    const envelope = `${ivEncoded ?? ""}.${ciphertextEncoded ?? ""}.${tagEncoded ?? ""}`;
    if (!ivEncoded || !ciphertextEncoded || !tagEncoded || !signature || extra || !safeEqual(signature, this.sign("cursor", envelope))) {
      throw invalidCursor();
    }
    try {
      const decipher = createDecipheriv("aes-256-gcm", this.cursorEncryptionKey(), Buffer.from(ivEncoded, "base64url"));
      decipher.setAAD(Buffer.from("asodef:koral:web-chat:cursor:v1", "utf8"));
      decipher.setAuthTag(Buffer.from(tagEncoded, "base64url"));
      const plaintext = Buffer.concat([decipher.update(Buffer.from(ciphertextEncoded, "base64url")), decipher.final()]);
      const parsed = JSON.parse(plaintext.toString("utf8")) as Partial<CursorPayload>;
      if (
        parsed.v !== 1
        || parsed.sessionId !== expectedSessionId
        || typeof parsed.occurredAt !== "string"
        || !Number.isFinite(Date.parse(parsed.occurredAt))
        || typeof parsed.messageId !== "string"
        || !/^[0-9a-f-]{36}$/iu.test(parsed.messageId)
        || typeof parsed.expiresAt !== "string"
        || !Number.isFinite(Date.parse(parsed.expiresAt))
        || Date.parse(parsed.expiresAt) <= now.getTime()
      ) throw new Error("invalid");
      return parsed as CursorPayload;
    } catch {
      throw invalidCursor();
    }
  }

  private sign(purpose: string, value: string): string {
    return createHmac("sha256", this.key).update(`asodef:koral:web-chat:${purpose}:v1\0${value}`).digest("hex");
  }

  private cursorEncryptionKey(): Buffer {
    return createHash("sha256").update(`asodef:koral:web-chat:cursor-encryption:v1\0${this.key}`).digest();
  }
}

function invalidCursor(): BadRequestException {
  return new BadRequestException({ code: "INVALID_WEB_CHAT_CURSOR", message: "El cursor del chat no es válido o expiró." });
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, "utf8");
  const rightBuffer = Buffer.from(right, "utf8");
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}
