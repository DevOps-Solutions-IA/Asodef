import { ConfigService } from "@nestjs/config";
import type { EnvConfig } from "../../../config/env.validation";
import { MfaSecretProtectorService } from "./mfa-secret-protector.service";

describe("MfaSecretProtectorService", () => {
  const config = { get: () => "test_encryption_key_needs_32_characters_min" } as unknown as ConfigService<EnvConfig, true>;

  it("encrypts with authenticated non-deterministic ciphertext and decrypts losslessly", () => {
    const service = new MfaSecretProtectorService(config);
    const secret = "JBSWY3DPEHPK3PXP";
    const first = service.encrypt(secret);
    const second = service.encrypt(secret);
    expect(first).not.toBe(second);
    expect(first).not.toContain(secret);
    expect(service.decrypt(first)).toBe(secret);
  });

  it("rejects tampered ciphertext", () => {
    const service = new MfaSecretProtectorService(config);
    const encrypted = service.encrypt("JBSWY3DPEHPK3PXP");
    const [version, iv, tag, ciphertext] = encrypted.split(".");
    if (!version || !iv || !tag || !ciphertext) throw new Error("Expected a complete encrypted MFA fixture");

    const tamperedCiphertext = Buffer.from(ciphertext, "base64url");
    const firstByte = tamperedCiphertext.at(0);
    if (firstByte === undefined) throw new Error("Expected a non-empty encrypted MFA fixture");
    tamperedCiphertext[0] = firstByte ^ 0x01;

    const tampered = [version, iv, tag, tamperedCiphertext.toString("base64url")].join(".");
    expect(() => service.decrypt(tampered)).toThrow();
  });
});
