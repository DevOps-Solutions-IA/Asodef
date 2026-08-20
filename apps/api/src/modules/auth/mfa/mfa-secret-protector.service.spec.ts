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
    expect(() => service.decrypt(`${encrypted.slice(0, -2)}xx`)).toThrow();
  });
});
